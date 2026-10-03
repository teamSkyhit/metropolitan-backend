import { assertNoHeaderInjection, assertValidEmail } from '../utils/email-sanitizer';
import type { NotificationEmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

export class NoopEmailProvider implements NotificationEmailProvider {
  readonly name = 'noop';

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    assertValidEmail(input.to);
    assertNoHeaderInjection(input.subject, 'email subject');
    if (input.replyTo) {
      assertValidEmail(input.replyTo);
    }

    return {
      success: true,
      messageId: `noop-${Date.now()}`,
    };
  }
}
