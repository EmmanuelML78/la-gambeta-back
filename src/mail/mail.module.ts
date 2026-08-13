import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

@Module({
  providers: [
    {
      provide: 'MAIL_TRANSPORT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTransport({
          host: configService.get<string>('MAIL_HOST'),
          port: configService.get<number>('MAIL_PORT'),
          secure: configService.get<number>('MAIL_PORT') === 465,
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASSWORD'),
          },
        }),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
