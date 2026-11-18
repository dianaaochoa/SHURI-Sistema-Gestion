<?php

namespace App\Http\Controllers\Api\Invoicing;

use App\Http\Controllers\Controller;
use App\Http\Requests\Invoicing\FiscalRules;
use App\Http\Resources\InvoiceResource;
use App\Models\Customer;
use App\Models\CustomerTaxProfile;
use App\Models\Invoice;
use App\Services\Invoicing\CfdiBuilder;
use App\Services\Invoicing\InvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Facturación en mostrador y administración (RF-16 · C3, AD6), con timbrado simulado.
 */
class InvoiceController extends Controller
{
    public function __construct(private readonly InvoiceService $invoices) {}

    /** GET /invoices?status=&type=&search= */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:issued,cancelled'],
            'type' => ['nullable', 'in:individual,global'],
            'search' => ['nullable', 'string', 'max:60'],
        ]);

        $page = Invoice::with('customer')
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($filters['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($filters['search'] ?? null, function ($q, $term) {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn ($w) => $w->where('rfc', 'like', $like)->orWhere('business_name', 'like', $like)->orWhere('sat_uuid', 'like', $like));
            })
            ->latest('id')
            ->paginate(30);

        return response()->json([
            'stamps_remaining' => $this->invoices->stampsRemaining(),
            'is_simulated' => $this->invoices->isSimulated(),
            'data' => InvoiceResource::collection($page->getCollection()),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    /** GET /invoices/catalogs — regímenes, usos del CFDI y motivos de cancelación */
    public function catalogs(): JsonResponse
    {
        return response()->json(['data' => FiscalRules::catalogs()]);
    }

    /** GET /invoices/{invoice} */
    public function show(Invoice $invoice): JsonResponse
    {
        return response()->json(['data' => new InvoiceResource($invoice->load(['customer', 'sales', 'replacedBy']))]);
    }

    /** GET /invoices/{invoice}/xml */
    public function xml(Invoice $invoice): Response
    {
        return response($this->invoices->xml($invoice), 200, [
            'Content-Type' => 'application/xml',
            'Content-Disposition' => 'attachment; filename="'.CfdiBuilder::fileName($invoice).'"',
        ]);
    }

    /** POST /invoices — C3 factura individual de una o varias ventas */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sales' => ['required', 'array', 'min:1', 'max:20'],
            'sales.*' => ['string', 'max:20'],
            'tax_profile_id' => ['nullable', 'integer', 'exists:customer_tax_profiles,id'],
            'save_profile' => ['nullable', 'boolean'],
        ] + $this->fiscalRules($request), [], ['sales' => 'ventas'] + FiscalRules::attributes());

        $fiscal = isset($data['tax_profile_id'])
            ? CustomerTaxProfile::find($data['tax_profile_id'])->only(['rfc', 'business_name', 'tax_regime', 'postal_code', 'cfdi_use', 'invoice_email'])
            : $data;

        $invoice = $this->invoices->issue($data['sales'], $fiscal, $request->user());

        // Guardar los datos para la próxima vez, si la venta es de un cliente registrado
        if (! empty($data['save_profile']) && ! isset($data['tax_profile_id']) && $invoice->customer) {
            $this->invoices->saveProfile($invoice->customer, $fiscal);
        }

        return response()->json([
            'message' => "Factura {$invoice->series}-{$invoice->number} emitida (simulada, sin validez fiscal).",
            'data' => new InvoiceResource($invoice),
        ], 201);
    }

    /** POST /invoices/global — AD6 factura global del mes (público en general) */
    public function storeGlobal(Request $request): JsonResponse
    {
        $data = $request->validate(['period' => ['required', 'date_format:Y-m']], [], ['period' => 'periodo']);

        $invoice = $this->invoices->issueGlobal($data['period'], $request->user());

        return response()->json([
            'message' => "Factura global {$invoice->series}-{$invoice->number} con {$invoice->sales->count()} venta(s).",
            'data' => new InvoiceResource($invoice),
        ], 201);
    }

    /** POST /invoices/{invoice}/cancel — motivos 02, 03 o 04 */
    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'in:02,03,04']], [
            'reason.in' => 'Para el motivo 01 (con errores con relación) usa la sustitución.',
        ], ['reason' => 'motivo de cancelación']);

        return response()->json([
            'message' => 'Factura cancelada. Sus ventas se pueden volver a facturar.',
            'data' => new InvoiceResource($this->invoices->cancel($invoice, $request->user(), $data['reason'])),
        ]);
    }

    /** POST /invoices/{invoice}/replace — sustitución con datos corregidos (motivo 01) */
    public function replace(Request $request, Invoice $invoice): JsonResponse
    {
        $data = $request->validate(FiscalRules::rules(required: false), [], FiscalRules::attributes());

        $new = $this->invoices->replace($invoice, $request->user(), $data);

        return response()->json([
            'message' => "Factura sustituida por {$new->series}-{$new->number}.",
            'data' => new InvoiceResource($new),
            'replaced' => new InvoiceResource($invoice->fresh(['replacedBy'])),
        ], 201);
    }

    /** GET /customers/{customer}/tax-profiles */
    public function profiles(Customer $customer): JsonResponse
    {
        return response()->json(['data' => $customer->customerTaxProfiles()->orderByDesc('is_default')->get()->map(fn ($p) => $this->profileRow($p))]);
    }

    /** POST /customers/{customer}/tax-profiles */
    public function storeProfile(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate(FiscalRules::rules(), [], FiscalRules::attributes());

        return response()->json([
            'message' => 'Datos fiscales guardados.',
            'data' => $this->profileRow($this->invoices->saveProfile($customer, $data)),
        ], 201);
    }

    /** Si se elige un perfil guardado no hace falta escribir los datos fiscales. */
    private function fiscalRules(Request $request): array
    {
        return $request->filled('tax_profile_id') ? [] : FiscalRules::rules();
    }

    /** @return array<string, mixed> */
    public static function profileRow(CustomerTaxProfile $profile): array
    {
        return [
            'id' => $profile->id,
            'rfc' => $profile->rfc,
            'business_name' => $profile->business_name,
            'tax_regime' => $profile->tax_regime,
            'postal_code' => $profile->postal_code,
            'cfdi_use' => $profile->cfdi_use,
            'invoice_email' => $profile->invoice_email,
            'is_default' => (bool) $profile->is_default,
        ];
    }
}
