<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Api\Invoicing\InvoiceController;
use App\Http\Controllers\Controller;
use App\Http\Requests\Invoicing\FiscalRules;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Models\Sale;
use App\Services\Invoicing\CfdiBuilder;
use App\Services\Invoicing\InvoiceService;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * P4.2 Autofacturación: el cliente guarda sus datos fiscales y factura sus propias compras.
 */
class PortalInvoiceController extends Controller
{
    public function __construct(
        private readonly InvoiceService $invoices,
        private readonly SettingsService $settings,
    ) {}

    /** GET /portal/invoices — mis facturas y mis compras que todavía puedo facturar */
    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();

        return response()->json([
            'self_invoicing_enabled' => $this->enabled(),
            'invoiceable_sales' => Sale::where('customer_id', $customer->id)->where('status', 'paid')->whereNull('invoice_id')
                ->latest('paid_at')->get()
                ->map(fn (Sale $s) => ['folio' => $s->folio, 'total' => (float) $s->total, 'paid_at' => $s->paid_at?->toIso8601String()]),
            'data' => InvoiceResource::collection(Invoice::with('sales')->where('customer_id', $customer->id)->latest('id')->get()),
        ]);
    }

    /** POST /portal/invoices */
    public function store(Request $request): JsonResponse
    {
        if (! $this->enabled()) {
            return response()->json(['message' => 'La autofacturación no está disponible. Pide tu factura en la sucursal.', 'code' => 'SELF_INVOICING_DISABLED'], 403);
        }

        $customer = $request->user();
        $data = $request->validate([
            'sales' => ['required', 'array', 'min:1', 'max:20'],
            'sales.*' => ['string', 'max:20'],
            'tax_profile_id' => ['required', 'integer', Rule::exists('customer_tax_profiles', 'id')->where('customer_id', $customer->id)],
        ], [], ['sales' => 'compras', 'tax_profile_id' => 'datos fiscales']);

        $profile = $customer->customerTaxProfiles()->findOrFail($data['tax_profile_id']);
        $invoice = $this->invoices->issue(
            $data['sales'],
            $profile->only(['rfc', 'business_name', 'tax_regime', 'postal_code', 'cfdi_use', 'invoice_email']),
            null,
            'portal',
            $customer,
        );

        return response()->json([
            'message' => 'Tu factura está lista y te la enviamos por correo. Es una simulación sin validez fiscal.',
            'data' => new InvoiceResource($invoice),
        ], 201);
    }

    /** GET /portal/invoices/{id}/xml */
    public function xml(Request $request, int $id): Response|JsonResponse
    {
        $invoice = Invoice::where('customer_id', $request->user()->id)->find($id);

        if (! $invoice) {
            return response()->json(['message' => 'No encontramos esa factura en tu cuenta.', 'code' => 'NOT_FOUND'], 404);
        }

        return response($this->invoices->xml($invoice), 200, [
            'Content-Type' => 'application/xml',
            'Content-Disposition' => 'attachment; filename="'.CfdiBuilder::fileName($invoice).'"',
        ]);
    }

    /** GET /portal/tax-profiles */
    public function profiles(Request $request): JsonResponse
    {
        return response()->json([
            'catalogs' => FiscalRules::catalogs(),
            'data' => $request->user()->customerTaxProfiles()->orderByDesc('is_default')->get()->map(fn ($p) => InvoiceController::profileRow($p)),
        ]);
    }

    /** POST /portal/tax-profiles */
    public function storeProfile(Request $request): JsonResponse
    {
        $data = $request->validate(FiscalRules::rules(), [], FiscalRules::attributes());

        return response()->json([
            'message' => 'Datos fiscales guardados.',
            'data' => InvoiceController::profileRow($this->invoices->saveProfile($request->user(), $data)),
        ], 201);
    }

    private function enabled(): bool
    {
        return (bool) $this->settings->get('self_invoicing_enabled', false);
    }
}
