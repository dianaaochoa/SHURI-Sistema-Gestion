<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Staff users. Role ids come from CatalogSeeder:
 * 1 admin · 2 head_technician · 3 technician · 4 cashier.
 *
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'role_id' => 3,
            'name' => fake()->name(),
            'username' => Str::lower(fake()->unique()->bothify('user####')),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('Password123'),
            'must_change_password' => false,
            'is_active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function admin(): static
    {
        return $this->state(['role_id' => 1, 'max_discount_pct' => 100]);
    }

    public function headTechnician(): static
    {
        return $this->state(['role_id' => 2, 'max_discount_pct' => 20]);
    }

    public function technician(): static
    {
        return $this->state(['role_id' => 3]);
    }

    public function cashier(): static
    {
        return $this->state(['role_id' => 4, 'max_discount_pct' => 10]);
    }

    /** First access with a temporary password assigned by the admin (AD7). */
    public function withTemporaryPassword(): static
    {
        return $this->state(['must_change_password' => true]);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
