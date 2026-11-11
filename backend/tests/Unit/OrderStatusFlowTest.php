<?php

namespace Tests\Unit;

use App\Models\OrderStatus as S;
use App\Support\OrderStatusFlow;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Máquina de estados de la orden (diagrama del README §14.4).
 * Usa el TestCase de Laravel (sin base de datos) porque ValidationException
 * necesita la aplicación cargada para armar el mensaje.
 */
class OrderStatusFlowTest extends TestCase
{
    public function test_allowed_transitions_follow_the_state_diagram(): void
    {
        $this->assertTrue(OrderStatusFlow::can(S::RECEIVED, S::ASSIGNED));
        $this->assertTrue(OrderStatusFlow::can(S::ASSIGNED, S::DIAGNOSING));
        $this->assertTrue(OrderStatusFlow::can(S::DIAGNOSING, S::QUOTING));
        $this->assertTrue(OrderStatusFlow::can(S::DIAGNOSING, S::NOT_REPAIRABLE));
        $this->assertTrue(OrderStatusFlow::can(S::QUOTE_PENDING, S::IN_REPAIR));
        $this->assertTrue(OrderStatusFlow::can(S::IN_REPAIR, S::QUOTE_PENDING)); // daño adicional
        $this->assertTrue(OrderStatusFlow::can(S::READY_FOR_PICKUP, S::DELIVERED));
        $this->assertTrue(OrderStatusFlow::can(S::ABANDONED, S::DISPOSED));
    }

    public function test_skipping_steps_is_not_allowed(): void
    {
        $this->assertFalse(OrderStatusFlow::can(S::ASSIGNED, S::READY_FOR_PICKUP));
        $this->assertFalse(OrderStatusFlow::can(S::RECEIVED, S::DIAGNOSING));
        $this->assertFalse(OrderStatusFlow::can(S::QUOTING, S::IN_REPAIR)); // falta que el cliente apruebe
    }

    public function test_final_states_cannot_change(): void
    {
        foreach ([S::DELIVERED, S::DISPOSED, S::CANCELLED] as $final) {
            foreach (array_keys(OrderStatusFlow::TRANSITIONS) as $to) {
                $this->assertFalse(OrderStatusFlow::can($final, $to), "{$final} → {$to}");
            }
        }
    }

    public function test_every_status_in_the_diagram_is_defined(): void
    {
        $codes = (new \ReflectionClass(S::class))->getConstants();
        $statusCodes = array_filter($codes, fn ($v, $k) => is_string($v) && ! in_array($k, ['CREATED_AT', 'UPDATED_AT'], true), ARRAY_FILTER_USE_BOTH);

        foreach ($statusCodes as $code) {
            $this->assertArrayHasKey($code, OrderStatusFlow::TRANSITIONS, "Falta el estado {$code}");
        }
    }

    public function test_assert_throws_a_readable_error(): void
    {
        $this->expectException(ValidationException::class);

        OrderStatusFlow::assert(S::ASSIGNED, S::DELIVERED, 'Asignado a Técnico');
    }
}
