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

        // Singleton pattern: one shared instance per request
        $this->app->singleton(SettingsService::class);
        $this->app->singleton(FolioService::class);

        // Repository pattern: code depends on the contract, Eloquent is the implementation
        $this->app->bind(OrderRepositoryInterface::class, OrderRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // One password policy for change, reset and temporary passwords (RNF-01)
        Password::defaults(fn () => Password::min(8)->letters()->mixedCase()->numbers());
    }
}
