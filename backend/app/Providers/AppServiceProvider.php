<?php

namespace App\Providers;

use App\Models\User;
use App\Repositories\Contracts\InventoryRepositoryInterface;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Repositories\Eloquent\InventoryRepository;
use App\Repositories\Eloquent\OrderRepository;
use App\Services\FolioService;
use App\Services\Invoicing\Contracts\StamperInterface;
use App\Services\Invoicing\SimulatedStamper;
use App\Services\SettingsService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Route;
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
        $this->app->bind(InventoryRepositoryInterface::class, InventoryRepository::class);

        // Patrón Strategy: el timbrado es simulado; un PAC real sería otra implementación
        $this->app->bind(StamperInterface::class, SimulatedStamper::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Una sola política de contraseñas para cambio, recuperación y temporales (RNF-01)
        Password::defaults(fn () => Password::min(8)->letters()->mixedCase()->numbers());

        // {user} en las rutas de administración (detalle, edición, baja, contraseña temporal,
        // desbloqueo y sesiones): un administrador no puede ver ni tocar la cuenta del super usuario.
        // Responde 404 como si no existiera.
        Route::bind('user', function (string $value) {
            $user = User::with('role')->findOrFail($value);
            $actor = request()->user();

            if ($user->isSuperUser() && ! ($actor instanceof User && $actor->isSuperUser())) {
                throw (new ModelNotFoundException)->setModel(User::class, [$value]);
            }

            return $user;
        });
    }
}
