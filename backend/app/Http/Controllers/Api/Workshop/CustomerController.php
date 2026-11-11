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

/**
 * Customers at the counter: C5 search/new customer, C8 customer file.
 */
class CustomerController extends Controller
{
    public function __construct(private readonly CustomerService $customers) {}

    /** GET /customers?search= (name, phone or email) */
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['search' => ['required', 'string', 'min:2', 'max:100']]);

        return CustomerSummaryResource::collection($this->customers->search($data['search']));
    }

    /** GET /customers/{customer} — with their devices, to pick one in C5 */
    public function show(Customer $customer): CustomerSummaryResource
    {
        return new CustomerSummaryResource($customer->load('devices')->loadCount('serviceOrders'));
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
