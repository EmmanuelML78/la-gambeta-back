import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AdminPaymentReviewController } from './admin-payment-review.controller';
import { AdminPaymentReviewService } from './admin-payment-review.service';
import { MercadoPagoAdapter } from './providers/mercadopago.adapter';
import { PolarAdapter } from './providers/polar.adapter';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './providers/payment-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    PaymentsService,
    AdminPaymentReviewService,
    // Puerto -> adapter activo, elegido por env. El dominio no se toca.
    // Los adapters se instancian por demanda: cada uno valida SUS credenciales
    // en el constructor, así el inactivo no tumba el arranque.
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider =>
        config.get<string>('PAYMENT_PROVIDER') === 'mercadopago'
          ? new MercadoPagoAdapter(config)
          : new PolarAdapter(config),
    },
  ],
  controllers: [PaymentsController, AdminPaymentReviewController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
