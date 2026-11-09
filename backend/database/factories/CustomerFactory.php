<?php

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * Portal customers. By default they already created their own password.
 *
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    protected static ?string $password;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'phone' => fake()->unique()->numerify('871#######'),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('Password123'),
            'must_change_password' => false,
            'password_changed_at' => now(),
            'is_active' => true,
        ];
    }

    /** Just registered at the counter: temporary password valid for 72 h (RF-06). */
    public function withTemporaryPassword(?\DateTimeInterface $expiresAt = null): static
    {
        return $this->state([
            'must_change_password' => true,
            'password_changed_at' => null,
            'temporary_password_expires_at' => $expiresAt ?? now()->addHours(72),
        ]);
    }
}
