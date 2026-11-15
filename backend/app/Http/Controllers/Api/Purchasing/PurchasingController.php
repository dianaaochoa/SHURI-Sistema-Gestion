<?php

namespace App\Http\Controllers\Api\Purchasing;

use App\Http\Controllers\Controller;
use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\PurchaseResource;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Services\Purchasing\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Compras a proveedores (RF-15): proveedores y pagos (AD5), pedidos (J5)
 * y recepción de mercancía con factura (C7).
 */
class PurchasingController extends Controller
{
    public function __construct(private readonly PurchaseService $purchases) {}

    // ── Proveedores ───────────────────────────────────────────────────────

    /** GET /suppliers?search=&active=1 */
    public function suppliers(Request $request): JsonResponse
    {
        $search = $request->validate(['search' => ['nullable', 'string', 'max:100']])['search'] ?? null;

        $suppliers = Supplier::query()
            ->when($search, fn ($q) => $q->where('name', 'like', '%'.addcslashes($search, '%_\\').'%'))
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $suppliers->map(fn (Supplier $s) => $this->supplierRow($s))]);
    }

    /** POST /suppliers · PUT /suppliers/{supplier} */
    public function saveSupplier(Request $request, ?Supplier $supplier = null): JsonResponse
    {
        $required = $supplier ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$required, 'string', 'max:150', Rule::unique('suppliers', 'name')->ignore($supplier?->id)],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:15'],
            'email' => ['nullable', 'email', 'max:150'],
            'rfc' => ['nullable', 'string', 'min:12', 'max:13'],
            'credit_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], [], ['name' => 'nombre', 'contact_name' => 'contacto', 'phone' => 'teléfono', 'email' => 'correo', 'credit_days' => 'días de crédito']);

        if (isset($data['rfc'])) {
            $data['rfc'] = mb_strtoupper($data['rfc']);
        }

        $supplier = $supplier ? tap($supplier)->update($data) : Supplier::create($data);

        return response()->json([
            'message' => 'Proveedor guardado.',
            'data' => $this->supplierRow($supplier->fresh()),
        ], $request->isMethod('post') ? 201 : 200);
    }

    // ── Pedidos (J5) ──────────────────────────────────────────────────────

    /** GET /purchase-orders?status= */
    public function orders(Request $request): AnonymousResourceCollection
    {
        $status = $request->validate(['status' => ['nullable', 'in:draft,sent,partially_received,received,cancelled']])['status'] ?? null;

        return PurchaseOrderResource::collection(
            PurchaseOrder::with(['supplier', 'purchaseOrderItems'])->when($status, fn ($q) => $q->where('status', $status))->latest('id')->paginate(30)
        );
    }

    /** GET /purchase-orders/{folio} */
    public function order(string $folio): JsonResponse
    {
        $order = $this->findOrder($folio);

        return $order instanceof JsonResponse ? $order : response()->json(['data' => new PurchaseOrderResource($order)]);
    }

    /** POST /purchase-orders — desde solicitudes de refacción y/o renglones a mano */
    public function storeOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')->where('is_active', true)],
            'part_requests' => ['nullable', 'array', 'max:50'],
            'part_requests.*' => ['string', 'max:20'],
            'items' => ['nullable', 'array', 'max:50'],
            'items.*.product_id' => ['nullable', 'integer', 'exists:products,id'],
            'items.*.description' => ['required_without:items.*.product_id', 'nullable', 'string', 'max:200'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:1000'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'expected_date' => ['nullable', 'date', 'after_or_equal:today'],
            'payment_terms' => ['nullable', 'in:cash_on_delivery,transfer,credit'],
            'receive_at' => ['nullable', 'in:counter,workshop'],
            'notify_technician' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [], ['supplier_id' => 'proveedor', 'part_requests' => 'solicitudes', 'items.*.quantity' => 'cantidad', 'expected_date' => 'fecha estimada']);

        $order = $this->purchases->createOrder($data, $request->user());

        return response()->json(['message' => "Pedido {$order->folio} creado en borrador.", 'data' => new PurchaseOrderResource($order)], 201);
    }

    /** POST /purchase-orders/{folio}/send */
    public function sendOrder(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate(['supplier_folio' => ['nullable', 'string', 'max:40']], [], ['supplier_folio' => 'folio del proveedor']);
        $order = $this->findOrder($folio);

        return $order instanceof JsonResponse ? $order : response()->json([
            'message' => 'Pedido enviado al proveedor.',
            'data' => new PurchaseOrderResource($this->purchases->sendOrder($order, $request->user(), $data['supplier_folio'] ?? null)),
        ]);
    }

    /** POST /purchase-orders/{folio}/cancel */
    public function cancelOrder(Request $request, string $folio): JsonResponse
    {
        $order = $this->findOrder($folio);

        return $order instanceof JsonResponse ? $order : response()->json([
            'message' => 'Pedido cancelado.',
            'data' => new PurchaseOrderResource($this->purchases->cancelOrder($order, $request->user())),
        ]);
    }

    /** POST /purchase-orders/{folio}/receive — llegó la mercancía (puede ser parcial) */
    public function receiveOrder(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'supplier_invoice' => ['nullable', 'string', 'max:40'],
            'tax' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'items.*.product_id' => ['nullable', 'integer'],
        ], [], ['supplier_invoice' => 'factura del proveedor', 'items' => 'renglones recibidos', 'items.*.quantity' => 'cantidad recibida']);

        $order = $this->findOrder($folio);

        if ($order instanceof JsonResponse) {
            return $order;
        }

        $purchase = $this->purchases->receiveOrder($order, $request->user(), $data);

        return response()->json([
            'message' => "Mercancía recibida en la compra {$purchase->folio}. El stock ya se actualizó.",
            'data' => new PurchaseResource($purchase),
            'purchase_order' => new PurchaseOrderResource($order->fresh(['supplier', 'purchaseOrderItems'])),
        ], 201);
    }

    // ── Compras y cuentas por pagar (C7, AD5) ─────────────────────────────

    /** GET /purchases?payment_status=pending&supplier_id= */
    public function purchasesIndex(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'payment_status' => ['nullable', 'in:pending,partial,paid'],
            'supplier_id' => ['nullable', 'integer'],
        ]);

        return PurchaseResource::collection(
            Purchase::with(['supplier', 'purchaseOrder'])
                ->when($filters['payment_status'] ?? null, fn ($q, $s) => $q->where('payment_status', $s))
                ->when($filters['supplier_id'] ?? null, fn ($q, $id) => $q->where('supplier_id', $id))
                ->orderBy('due_date')
                ->latest('id')
                ->paginate(30)
        );
    }

    /** GET /purchases/{folio} */
    public function purchase(string $folio): JsonResponse
    {
        $purchase = Purchase::with(['supplier', 'purchaseOrder', 'purchaseItems.product', 'supplierPayments'])->where('folio', $folio)->first();

        return $purchase
            ? response()->json(['data' => new PurchaseResource($purchase)])
            : response()->json(['message' => "No existe la compra {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }

    /** POST /purchases — C7 entrada de mercancía con factura, sin pedido previo */
    public function storePurchase(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'supplier_invoice' => ['nullable', 'string', 'max:40'],
            'purchase_date' => ['nullable', 'date', 'before_or_equal:today'],
            'tax' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:10000'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:999999.99'],
        ], [], ['supplier_id' => 'proveedor', 'supplier_invoice' => 'factura del proveedor', 'items' => 'productos']);

        $lines = array_map(fn ($item) => [
            'product_id' => (int) $item['product_id'],
            'quantity' => (int) $item['quantity'],
            'unit_cost' => (float) ($item['unit_cost'] ?? Product::whereKey($item['product_id'])->value('purchase_price')),
        ], $data['items']);

        $purchase = $this->purchases->registerPurchase((int) $data['supplier_id'], $lines, $request->user(), $data);

        return response()->json([
            'message' => "Compra {$purchase->folio} registrada. El stock ya se actualizó.",
            'data' => new PurchaseResource($purchase),
        ], 201);
    }

    /** POST /purchases/{folio}/payments — AD5 pago al proveedor */
    public function pay(Request $request, string $folio): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', 'in:cash,card,transfer'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999.99'],
            'reference' => ['nullable', 'string', 'max:80'],
        ], [], ['method' => 'forma de pago', 'amount' => 'monto', 'reference' => 'referencia']);

        $purchase = Purchase::where('folio', $folio)->first();

        if (! $purchase) {
            return response()->json(['message' => "No existe la compra {$folio}.", 'code' => 'NOT_FOUND'], 404);
        }

        $this->purchases->pay($purchase, $request->user(), $data);

        return response()->json([
            'message' => 'Pago registrado.',
            'data' => new PurchaseResource($purchase->fresh(['supplier', 'purchaseOrder', 'purchaseItems.product', 'supplierPayments'])),
        ], 201);
    }

    private function findOrder(string $folio): PurchaseOrder|JsonResponse
    {
        return PurchaseOrder::with(['supplier', 'purchaseOrderItems'])->where('folio', $folio)->first()
            ?? response()->json(['message' => "No existe el pedido {$folio}.", 'code' => 'NOT_FOUND'], 404);
    }

    /** @return array<string, mixed> */
    private function supplierRow(Supplier $supplier): array
    {
        return [
            'id' => $supplier->id,
            'name' => $supplier->name,
            'contact_name' => $supplier->contact_name,
            'phone' => $supplier->phone,
            'email' => $supplier->email,
            'rfc' => $supplier->rfc,
            'credit_days' => $supplier->credit_days,
            'notes' => $supplier->notes,
            'is_active' => (bool) $supplier->is_active,
            // Saldo pendiente de pagar a este proveedor (cuentas por pagar)
            'debt' => round((float) Purchase::where('supplier_id', $supplier->id)->where('payment_status', '<>', 'paid')
                ->sum(DB::raw('total - amount_paid')), 2),
        ];
    }
}
