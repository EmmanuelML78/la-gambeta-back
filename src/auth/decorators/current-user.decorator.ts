import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BetterAuthUser } from '../types/oauth.types';

export const CurrentUser = createParamDecorator(
  (data: keyof BetterAuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: BetterAuthUser }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
