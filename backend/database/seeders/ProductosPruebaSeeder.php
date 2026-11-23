<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use App\Services\Inventory\InventoryService;
use Illuminate\Database\Seeder;

/**
 * Productos de prueba con existencias, para una base que ya tiene datos.
 * Solo agrega: crea las categorías que falten y los productos cuyo SKU no exista
 * (correrlo dos veces no duplica nada). No borra usuarios ni órdenes.
 *
 * php artisan db:seed --class=ProductosPruebaSeeder
 */
class ProductosPruebaSeeder extends Seeder
{
    /** [categoría, sku, nombre, marca, compatible con, costo, precio, existencias, mínimo, mostrador, taller] */
    private const PRODUCTOS = [
        ['Pantallas', 'PAN-A54', 'Pantalla Galaxy A54 OLED', 'Samsung', 'Galaxy A54', 450, 720, 4, 2, false, true],
        ['Pantallas', 'PAN-IP13', 'Pantalla iPhone 13 incell', 'Genérica', 'iPhone 13', 780, 1250, 3, 1, false, true],
        ['Baterías', 'BAT-IP11', 'Batería iPhone 11', 'Genérica', 'iPhone 11', 220, 450, 6, 2, false, true],
        ['Puertos y conectores', 'PUE-USBC-A', 'Puerto de carga USB-C Galaxy serie A', 'Samsung', 'Galaxy A32, A52, A54', 60, 180, 10, 3, false, true],
        ['Cámaras y bocinas', 'BOC-IP12', 'Bocina auricular iPhone 12', 'Genérica', 'iPhone 12', 90, 250, 5, 2, false, true],
        ['Cables y cargadores', 'CAR-20W', 'Cargador USB-C 20 W', 'Genérica', 'Universal', 120, 299, 15, 5, true, false],
        ['Fundas y micas', 'MIC-A54', 'Mica de cristal templado Galaxy A54', 'Genérica', 'Galaxy A54', 25, 100, 20, 5, true, true],
        ['Audífonos', 'AUD-BT01', 'Audífonos Bluetooth con estuche', 'Genérica', 'Universal', 180, 399, 8, 3, true, false],
    ];

    public function run(InventoryService $inventory): void
    {
        // Las categorías del catálogo (insertOrIgnore: no duplica)
        $this->call(CategorySeeder::class);

        // Las existencias entran por el kardex a nombre del administrador (o el súper usuario)
        $by = User::whereIn('role_id', [1, 5])->orderBy('role_id')->orderBy('id')->first() ?? User::query()->orderBy('id')->first();

        if (! $by) {
            $this->command?->warn('No hay usuarios: crea primero un administrador.');

            return;
        }

        $creados = 0;
        foreach (self::PRODUCTOS as [$category, $sku, $name, $brand, $compatible, $cost, $price, $stock, $min, $counter, $workshop]) {
            if (Product::where('sku', $sku)->exists()) {
                continue;
            }

            $categoryModel = Category::where('name', $category)->firstOrFail();

            $product = Product::create([
                'category_id' => $categoryModel->id,
                'sku' => $sku,
                'name' => $name,
                'brand' => $brand,
                'compatible_with' => $compatible,
                'type' => $categoryModel->type,
                'sellable_at_counter' => $counter,
                'usable_in_workshop' => $workshop,
                'purchase_price' => $cost,
                'sale_price' => $price,
                'stock' => 0,
                'min_stock' => $min,
                'is_active' => true,
            ]);

            $inventory->move($product->id, 'stock_in', $stock, $by, 'Inventario inicial de pruebas');
            $creados++;
        }

        $this->command?->info("Productos de prueba agregados: {$creados}.");
    }
}
