import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MercadoPagoAdapter } from './providers/mercadopago.adapter';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    PaymentsService,
    MercadoPagoAdapter,
    // Puerto -> adapter activo. Para cambiar de proveedor por país,
    // se resuelve acá (o con un factory/registry) — el dominio no se toca.
    { provide: PAYMENT_PROVIDER, useExisting: MercadoPagoAdapter },
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
