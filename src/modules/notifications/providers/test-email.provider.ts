import { assertNoHeaderInjection, assertValidEmail } from '../utils/email-sanitizer';
import type { NotificationEmailProvider, SendEmailInput, SendEmailResult } from './email-provider.interface';

export class TestEmailProvider implements NotificationEmailProvider {
  readonly name = 'test';
  private sentMessages: SendEmailInput[] = [];
  public shouldFail = false;
  public failureMessage = 'Simulated provider connection failure';

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    assertValidEmail(input.to);
    assertNoHeaderInjection(input.subject, 'email subject');
    if (input.replyTo) {
      assertValidEmail(input.replyTo);
    }

    if (this.shouldFail) {
      return {
        success: false,
        error: this.failureMessage,
      };
    }

    this.sentMessages.push({ ...input });
    return {
      success: true,
      messageId: `test-${this.sentMessages.length}-${Date.now()}`,
    };
  }

  getSent(): readonly SendEmailInput[] {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
    this.shouldFail = false;
  }
}
