<?php

namespace App\Http\Controllers\Api\Workshop;

use App\Http\Controllers\Controller;
use App\Http\Requests\Workshop\StoreCustomerRequest;
use App\Http\Resources\CustomerSummaryResource;
use App\Models\Customer;
use App\Services\Workshop\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * Clientes en mostrador: C5 buscar/nuevo cliente, C8 ficha del cliente.
 */
class CustomerController extends Controller
{
    public function __construct(private readonly CustomerService $customers) {}

    /**
     * GET /customers?search= (nombre, teléfono o correo). Sin búsqueda: todos los clientes (C8).
     * Cada uno trae su resumen: equipos activos, última visita, total gastado y visitas.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'min:2', 'max:100']]);

        return CustomerSummaryResource::collection($this->customers->listing($data['search'] ?? null));
    }

    /** GET /customers/{customer} — con sus equipos (C5) y su historial de órdenes y compras (C8.3) */
    public function show(Customer $customer): JsonResponse
    {
        $customer->load('devices')->loadCount('serviceOrders');

        return response()->json([
            'data' => new CustomerSummaryResource($customer),
            'history' => $this->customers->history($customer),
            // Para reimprimir la hoja de recepción (C11) mientras no cree su contraseña propia
            'portal_temporary_password' => $customer->must_change_password ? $customer->temporary_password_encrypted : null,
        ]);
    }

    /** PUT /customers/{customer} — C8 editar datos del cliente */
    public function update(Request $request, Customer $customer): JsonResponse
    {
        $request->merge(array_filter([
            'email' => $request->has('email') ? mb_strtolower(trim((string) $request->input('email'))) : null,
            'phone' => $request->has('phone') ? preg_replace('/\D/', '', (string) $request->input('phone')) : null,
        ], fn ($v) => $v !== null));

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'phone' => ['sometimes', 'required', 'digits:10', Rule::unique('customers', 'phone')->ignore($customer->id)],
            'email' => ['sometimes', 'required', 'email', 'max:150', Rule::unique('customers', 'email')->ignore($customer->id)],
            'address' => ['sometimes', 'nullable', 'string', 'max:200'],
            'city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'postal_code' => ['sometimes', 'nullable', 'digits:5'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:255'],
        ], [], ['name' => 'nombre', 'last_name' => 'apellidos', 'phone' => 'teléfono', 'email' => 'correo', 'address' => 'dirección', 'city' => 'ciudad', 'postal_code' => 'código postal', 'notes' => 'notas']);

        $customer = $this->customers->update($customer, $data, $request->user());

        return response()->json([
            'message' => 'Cliente actualizado.',
            'data' => new CustomerSummaryResource($customer->loadCount('serviceOrders')),
        ]);
    }

    /** POST /customers */
    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $customer = $this->customers->create($request->validated(), $request->user());

        return response()->json([
            'message' => 'Cliente registrado.',
            'data' => new CustomerSummaryResource($customer),
        ], 201);
    }

    /** POST /customers/{customer}/temporary-password — C8 "Contraseña temporal" */
    public function temporaryPassword(Request $request, Customer $customer): JsonResponse
    {
        $access = $this->customers->issueTemporaryPassword($customer, $request->user());

        return response()->json([
            'message' => 'Contraseña temporal generada. Entrégala al cliente.',
            'email' => $customer->email,
            'temporary_password' => $access['temporary_password'],
            'expires_at' => $access['expires_at']->toIso8601String(),
        ]);
    }
}
