<?php

namespace App\Providers;

use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Repositories\Eloquent\OrderRepository;
use App\Services\FolioService;
use App\Services\SettingsService;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // personal_access_tokens is created by our own migration
        Sanctum::ignoreMigrations();

        // Patrón Singleton: una sola instancia compartida por petición
        $this->app->singleton(SettingsService::class);
        $this->app->singleton(FolioService::class);

        // Patrón Repository: el código depende del contrato; Eloquent es la implementación
        $this->app->bind(OrderRepositoryInterface::class, OrderRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Una sola política de contraseñas para cambio, recuperación y temporales (RNF-01)
        Password::defaults(fn () => Password::min(8)->letters()->mixedCase()->numbers());
    }
}
