<?php

namespace App\Http\Requests\Workshop;

use Illuminate\Foundation\Http\FormRequest;

/**
 * C5 New service order. Accepts an existing customer (customer_id) or a new
 * one (customer: {...}), and an existing device (device.id) or a new one.
 */
class StoreServiceOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // route already requires permission:orders.receive
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'integer', 'required_without:customer'],
            'customer' => ['nullable', 'array', 'required_without:customer_id'],
            'customer.name' => ['required_with:customer', 'string', 'max:100'],
            'customer.last_name' => ['nullable', 'string', 'max:100'],
            'customer.phone' => ['required_with:customer', 'digits:10', 'unique:customers,phone'],
            'customer.email' => ['required_with:customer', 'email', 'max:150', 'unique:customers,email'],

            'device' => ['required', 'array'],
            'device.id' => ['nullable', 'integer'],
            'device.type' => ['required_without:device.id', 'nullable', 'string', 'max:40'],
            'device.brand' => ['required_without:device.id', 'nullable', 'string', 'max:60'],
            'device.model' => ['nullable', 'string', 'max:80'],
            'device.serial_number' => ['nullable', 'string', 'max:80'],
            'device.color' => ['nullable', 'string', 'max:40'],

            'reported_issue' => ['required', 'string', 'max:2000'],
            'received_accessories' => ['nullable', 'string', 'max:255'],
            'physical_condition' => ['nullable', 'string', 'max:255'],
            'intake_checklist' => ['nullable', 'array'],
            'device_pin' => ['nullable', 'string', 'max:50'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'promised_date' => ['nullable', 'date', 'after_or_equal:today'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'customer_id' => 'cliente',
            'customer' => 'cliente',
            'customer.name' => 'nombre del cliente',
            'customer.last_name' => 'apellidos',
            'customer.phone' => 'teléfono',
            'customer.email' => 'correo',
            'device' => 'equipo',
            'device.type' => 'tipo de equipo',
            'device.brand' => 'marca',
            'device.model' => 'modelo',
            'device.serial_number' => 'IMEI o número de serie',
            'device.color' => 'color',
            'reported_issue' => 'falla reportada',
            'received_accessories' => 'accesorios',
            'physical_condition' => 'condición física',
            'device_pin' => 'PIN o patrón',
            'priority' => 'prioridad',
            'promised_date' => 'fecha prometida',
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_array($this->input('customer'))) {
            $customer = $this->input('customer');
            $customer['email'] = isset($customer['email']) ? mb_strtolower(trim((string) $customer['email'])) : null;
            $customer['phone'] = isset($customer['phone']) ? preg_replace('/\D/', '', (string) $customer['phone']) : null;
            $this->merge(['customer' => $customer]);
        }
    }
}
