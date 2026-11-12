<?php

namespace App\Services\Workshop;

use App\Mail\OrderUpdateMail;
use App\Models\Customer;
use App\Models\LaborLevel;
use App\Models\OrderLog;
use App\Models\OrderStatus;
use App\Models\Product;
use App\Models\Quote;
use App\Models\QuoteItem;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Services\AuditService;
use App\Services\FolioService;
use App\Services\MailService;
use App\Services\SettingsService;
use App\Support\OrderStatusFlow;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cotización y aprobación (RF-10, RF-07, README §14.4):
 *  1. El diagnóstico del técnico crea un presupuesto "por cotizar" (to_quote).
 *  2. El jefe lo cotiza con precios del catálogo y lo envía (pending) → correo al cliente.
 *  3. El cliente aprueba (En reparación) o rechaza (Presupuesto rechazado) desde el portal.
 *  4. El jefe libera el equipo terminado (Listo para recoger) → correo al cliente.
 */
class QuoteService
{
    public function __construct(
        private readonly FolioService $folios,
        private readonly SettingsService $settings,
        private readonly MailService $mailer,
        private readonly AuditService $audit,
    ) {}

    /**
     * Paso 1: el diagnóstico con reparación deja un presupuesto por cotizar.
     * Si el jefe lo había regresado al técnico, se reutiliza el mismo presupuesto.
     *
     * @param  array<string, mixed>  $data
     */
    public function draftFromDiagnosis(ServiceOrder $order, User $technician, array $data): Quote
    {
        $draft = Quote::where('service_order_id', $order->id)
            ->whereIn('status', ['to_quote', 'returned_to_technician'])
            ->latest('id')
            ->first();

        $attributes = [
            'technician_id' => $technician->id,
            'diagnosis' => $data['diagnosis'],
            'failure_cause' => $data['failure_cause'] ?? null,
            'labor_level_id' => $data['labor_level_id'],
            'estimated_minutes' => $data['estimated_minutes'] ?? null,
            'is_urgent' => in_array($order->priority, ['high', 'urgent'], true),
            'status' => 'to_quote',
        ];

        if ($draft) {
            $draft->forceFill($attributes)->save();

            return $draft;
        }

        return Quote::create($attributes + [
            'folio' => $this->folios->next('quote'),
            'service_order_id' => $order->id,
            'customer_id' => $order->customer_id,
            'type' => 'initial',
            'created_by' => $technician->id,
        ]);
    }

    /**
     * Bandeja del jefe (J3): presupuestos por cotizar, los urgentes primero.
     *
     * @return Collection<int, object>
     */
    public function toQuote(): Collection
    {
        return DB::table('v_orders_to_quote')
            ->orderByDesc('is_urgent')
            ->orderBy('sent_by_technician_at')
            ->get();
    }

    /**
     * Paso 2: el jefe arma el presupuesto y lo envía al cliente.
     *
     * @param  array<string, mixed>  $data
     */
    public function send(Quote $quote, User $head, array $data): Quote
    {
        DB::transaction(function () use ($quote, $head, $data) {
            $quote = Quote::lockForUpdate()->findOrFail($quote->id);
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($quote->service_order_id);

            if ($quote->status !== 'to_quote') {
                throw ValidationException::withMessages(['status' => 'Este presupuesto ya no está por cotizar.']);
            }

            OrderStatusFlow::assert($order->status->code, OrderStatus::QUOTE_PENDING, $order->status->name);

            QuoteItem::where('quote_id', $quote->id)->delete();
            [$labor, $parts] = $this->saveItems($quote, $data['items']);

            $discount = round((float) ($data['discount'] ?? 0), 2);
            if ($discount > $labor + $parts) {
                throw ValidationException::withMessages(['discount' => 'El descuento no puede ser mayor al total del presupuesto.']);
            }

            $quote->forceFill([
                'labor_amount' => $labor,
                'parts_amount' => $parts,
                'discount' => $discount,
                'warranty_days' => $data['warranty_days'] ?? $this->settings->int('default_warranty_days', 30),
                'valid_until' => now()->addDays($this->settings->int('quote_valid_days', 7))->toDateString(),
                'customer_note' => $data['customer_note'] ?? null,
                'estimated_delivery_date' => $data['estimated_delivery_date'] ?? null,
                'status' => 'pending',
                'quoted_by' => $head->id,
                'quoted_at' => now(),
                'sent_at' => now(),
            ])->save();

            $total = round($labor + $parts - $discount, 2);

            $order->forceFill([
                'estimated_cost' => $total,
                'status_id' => OrderStatus::idFor(OrderStatus::QUOTE_PENDING),
                'updated_by' => $head->id,
            ])->save();

            $this->log($order, $head, 'quote', "Presupuesto {$quote->folio} enviado por \$".number_format($total, 2).'.', $quote->id);
        });

        $quote = $quote->fresh(['quoteItems', 'serviceOrder.customer']);
        $this->notifyQuote($quote);

        return $quote;
    }

    /** El jefe regresa el presupuesto al técnico para que revise el diagnóstico. */
    public function returnToTechnician(Quote $quote, User $head, string $reason): Quote
    {
        DB::transaction(function () use ($quote, $head, $reason) {
            $quote = Quote::lockForUpdate()->findOrFail($quote->id);
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($quote->service_order_id);

            if ($quote->status !== 'to_quote') {
                throw ValidationException::withMessages(['status' => 'Solo se puede regresar un presupuesto por cotizar.']);
            }

            OrderStatusFlow::assert($order->status->code, OrderStatus::DIAGNOSING, $order->status->name);

            $quote->forceFill(['status' => 'returned_to_technician', 'return_reason' => $reason])->save();
            $order->forceFill(['status_id' => OrderStatus::idFor(OrderStatus::DIAGNOSING), 'updated_by' => $head->id])->save();

            $this->log($order, $head, 'quoting', "Presupuesto {$quote->folio} regresado al técnico: {$reason}", $quote->id);
        });

        return $quote->fresh('quoteItems');
    }

    /**
     * Paso 3 (RF-07): el cliente aprueba o rechaza desde el portal.
     * La decisión queda en la bitácora visible y el técnico la ve en su banco.
     */
    public function respond(Quote $quote, Customer $customer, bool $approved, ?string $comment, ?string $ip): Quote
    {
        // La vigencia se revisa fuera de la transacción: si se marcara "vencido" adentro,
        // el error que sigue revertiría también esa marca
        if ($quote->status === 'pending' && $quote->valid_until && $quote->valid_until->isPast() && ! $quote->valid_until->isToday()) {
            $quote->forceFill(['status' => 'expired'])->save();
            throw ValidationException::withMessages(['status' => 'El presupuesto venció. Comunícate con la sucursal para pedir uno nuevo.']);
        }

        DB::transaction(function () use ($quote, $customer, $approved, $comment, $ip) {
            $quote = Quote::lockForUpdate()->findOrFail($quote->id);
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($quote->service_order_id);

            if ($quote->status !== 'pending') {
                throw ValidationException::withMessages(['status' => 'Este presupuesto ya fue respondido.']);
            }

            $target = $approved ? OrderStatus::IN_REPAIR : OrderStatus::QUOTE_REJECTED;
            OrderStatusFlow::assert($order->status->code, $target, $order->status->name);

            $quote->forceFill([
                'status' => $approved ? 'approved' : 'rejected',
                'response_channel' => 'portal',
                'customer_comment' => $comment,
                'answered_at' => now(),
                'response_ip' => $ip,
            ])->save();

            $orderData = ['status_id' => OrderStatus::idFor($target)];

            if ($approved) {
                // El costo aprobado es lo que la cajera cobra al entregar (OrderBalance)
                $total = (float) $quote->fresh()->total;
                $parts = min((float) $quote->parts_amount, $total);
                $orderData += [
                    'labor_cost' => round($total - $parts, 2),
                    'parts_cost' => round($parts, 2),
                    'warranty_days' => $quote->warranty_days,
                ];
            }

            $order->forceFill($orderData)->save();

            $this->log($order, null, 'customer_response', ($approved ? 'El cliente aprobó' : 'El cliente rechazó')
                ." el presupuesto {$quote->folio}".($comment ? ": «{$comment}»" : '.'), $quote->id);

            $this->audit->log('portal', $approved ? 'quote_approved' : 'quote_rejected',
                "Presupuesto {$quote->folio} (cliente #{$customer->id})", null, 'quotes', $quote->id);
        });

        return $quote->fresh('quoteItems');
    }

    /** Paso 4 (J8): el jefe libera el equipo terminado → Listo para recoger + correo. */
    public function release(ServiceOrder $order, User $head): ServiceOrder
    {
        DB::transaction(function () use ($order, $head) {
            $order = ServiceOrder::with('status')->lockForUpdate()->findOrFail($order->id);

            OrderStatusFlow::assert($order->status->code, OrderStatus::READY_FOR_PICKUP, $order->status->name);

            // Si el técnico dejó el cronómetro corriendo, se cierra aquí
            DB::table('order_time_logs')->where('service_order_id', $order->id)->whereNull('ends_at')->update(['ends_at' => now()]);

            $order->forceFill([
                'status_id' => OrderStatus::idFor(OrderStatus::READY_FOR_PICKUP),
                'is_paused' => false,
                'pause_reason' => null,
                'updated_by' => $head->id,
            ])->save();
        });

        $order = $order->fresh(['status', 'customer', 'device', 'technician', 'receivedBy']);

        $this->mailer->send(new OrderUpdateMail(
            subjectLine: "Tu equipo está listo para recoger · Folio {$order->folio}",
            customerName: $order->customer->name,
            folio: $order->folio,
            title: '¡Tu equipo está listo!',
            body: $order->status->customer_message,
            details: [
                'Equipo' => ServiceOrderService::deviceLabel($order->device),
                'Horario' => (string) $this->settings->get('business_hours'),
                'Sin costo de almacenaje' => $this->settings->int('pickup_grace_days', 7).' días',
            ],
            buttonText: 'Ver mi equipo',
            portalUrl: config('app.portal_url'),
        ), $order->customer, 'ready_for_pickup');

        return $order;
    }

    /**
     * Guarda los renglones con precios del catálogo. Devuelve [mano de obra, refacciones].
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array{0: float, 1: float}
     */
    private function saveItems(Quote $quote, array $items): array
    {
        $labor = 0.0;
        $parts = 0.0;

        foreach ($items as $i => $item) {
            $quantity = (int) ($item['quantity'] ?? 1);

            $row = match ($item['type']) {
                'part' => $this->partRow($item, $quantity, $i),
                'labor' => $this->laborRow($item, $i),
                default => [
                    'concept' => $item['concept'],
                    'unit_cost' => null,
                    'unit_price' => round((float) $item['unit_price'], 2),
                    'product_id' => null, 'labor_level_id' => null, 'out_of_stock' => false,
                ],
            };

            QuoteItem::create($row + [
                'quote_id' => $quote->id,
                'type' => $item['type'],
                'quantity' => $item['type'] === 'labor' ? 1 : $quantity,
                'origin' => 'head_technician',
            ]);

            if ($item['type'] === 'labor') {
                $labor += $row['unit_price'];
            } else {
                $parts += $row['unit_price'] * $quantity;
            }
        }

        return [round($labor, 2), round($parts, 2)];
    }

    /** @return array<string, mixed> */
    private function partRow(array $item, int $quantity, int $i): array
    {
        $product = Product::where('is_active', true)->where('usable_in_workshop', true)->find($item['product_id'] ?? 0);

        if (! $product) {
            throw ValidationException::withMessages(["items.{$i}.product_id" => 'La refacción no existe o no se usa en el taller.']);
        }

        return [
            'product_id' => $product->id,
            'labor_level_id' => null,
            'concept' => $product->name,
            'unit_cost' => $product->purchase_price,
            'unit_price' => (float) $product->sale_price,
            'out_of_stock' => $product->stock < $quantity,
        ];
    }

    /** @return array<string, mixed> */
    private function laborRow(array $item, int $i): array
    {
        $level = LaborLevel::where('is_active', true)->find($item['labor_level_id'] ?? 0);

        if (! $level) {
            throw ValidationException::withMessages(["items.{$i}.labor_level_id" => 'El nivel de mano de obra no existe.']);
        }

        return [
            'product_id' => null,
            'labor_level_id' => $level->id,
            'concept' => "Mano de obra · {$level->name}",
            'unit_cost' => null,
            'unit_price' => (float) $level->price,
            'out_of_stock' => false,
        ];
    }

    /** RF-10 / RF-17: aviso al cliente de que tiene un presupuesto por aprobar. */
    private function notifyQuote(Quote $quote): void
    {
        $order = $quote->serviceOrder;

        $this->mailer->send(new OrderUpdateMail(
            subjectLine: "Tu presupuesto está listo · Folio {$order->folio}",
            customerName: $order->customer->name,
            folio: $order->folio,
            title: 'Tienes un presupuesto por aprobar',
            body: 'Ya revisamos tu equipo. Revisa el desglose del costo y apruébalo en el portal para iniciar la reparación.',
            details: [
                'Presupuesto' => $quote->folio,
                'Total' => '$'.number_format((float) $quote->total, 2),
                'Válido hasta' => $quote->valid_until?->format('d/m/Y') ?? '',
            ],
            buttonText: 'Revisar y aprobar',
            portalUrl: config('app.portal_url'),
        ), $order->customer, 'quote_pending');
    }

    private function log(ServiceOrder $order, ?User $user, string $type, string $description, int $quoteId): void
    {
        OrderLog::create([
            'service_order_id' => $order->id,
            'user_id' => $user?->id,
            'type' => $type,
            'quote_id' => $quoteId,
            'description' => $description,
            'visible_to_customer' => $type !== 'quoting', // regresar al técnico es interno
        ]);
    }
}
