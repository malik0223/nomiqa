import type { InvoiceDetail } from '@nomiqa/contracts';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ApiError } from '@/lib/api-client';
import { fetchInvoice, formatOmr } from '@/lib/billing';
import { activeOrganizationId } from '@/lib/cards';
import { PayInvoiceButton } from './pay-button';
import { formatDate } from '@/lib/format';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * صفحة الفاتورة.
 *
 * تُطبع كما هي: `print:` في التنسيقات تخفي التنقّل والأزرار، فيخرج
 * المستند بلا واجهة. الفاتورة مستند ضريبي يُرسَل إلى محاسب، وإجبار
 * العميل على تصويرها بلقطة شاشة كان سيُنتج مستنداً لا يُقبل.
 */
export default async function InvoicePage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();

  let invoice: InvoiceDetail;

  try {
    const organizationId = await activeOrganizationId();
    invoice = await fetchInvoice(organizationId, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const vatPercent = (invoice.vatRateBps / 100).toFixed(invoice.vatRateBps % 100 === 0 ? 0 : 1);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/billing" className="text-sm text-primary hover:underline print:hidden">
        ← {t('billing.backToBilling')}
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold">{invoice.number}</h1>
          <p className="mt-1 text-sm text-faint">
            {t(`billing.invoiceStatus.${invoice.status}`)}
          </p>
        </div>

        <div className="text-end text-sm text-muted">
          {invoice.issuedAt ? (
            <p>
              {t('billing.issuedAt')}: {formatDate(invoice.issuedAt, locale)}
            </p>
          ) : null}
          {invoice.dueAt ? (
            <p>
              {t('billing.dueAt')}: {formatDate(invoice.dueAt, locale)}
            </p>
          ) : null}
        </div>
      </header>

      {invoice.billingName ? (
        <section className="mt-8 rounded-card border border-line p-4 text-sm">
          <h2 className="text-xs font-medium text-faint">{t('billing.billedTo')}</h2>
          <p className="mt-1 font-medium">{invoice.billingName}</p>
          {invoice.billingVatNumber ? (
            <p className="text-muted">
              {t('billing.vatNumber')}: {invoice.billingVatNumber}
            </p>
          ) : null}
          {invoice.billingAddress ? (
            <p className="text-muted">{invoice.billingAddress}</p>
          ) : null}
        </section>
      ) : null}

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className="py-2 text-start font-medium">{t('billing.description')}</th>
            <th className="py-2 text-end font-medium">{t('billing.quantity')}</th>
            <th className="py-2 text-end font-medium">{t('billing.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td className="py-3">
                {locale === 'en' ? (line.descriptionEn ?? line.description) : line.description}
              </td>
              <td className="py-3 text-end">{line.quantity}</td>
              <td className="py-3 text-end">{formatOmr(line.amountBaisa, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-6 ms-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-faint">{t('billing.subtotal')}</dt>
          <dd>{formatOmr(invoice.subtotalBaisa, locale)}</dd>
        </div>

        {invoice.discountBaisa > 0 ? (
          <div className="flex justify-between text-primary">
            <dt>{t('billing.discount')}</dt>
            <dd>−{formatOmr(invoice.discountBaisa, locale)}</dd>
          </div>
        ) : null}

        <div className="flex justify-between">
          <dt className="text-faint">
            {t('billing.vat')} ({vatPercent}%)
          </dt>
          <dd>{formatOmr(invoice.vatBaisa, locale)}</dd>
        </div>

        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <dt>{t('billing.total')}</dt>
          <dd>{formatOmr(invoice.totalBaisa, locale)}</dd>
        </div>
      </dl>

      {invoice.status === 'open' ? (
        <div className="mt-8 print:hidden">
          <PayInvoiceButton
            invoiceId={invoice.id}
            existingUrl={invoice.checkoutUrl}
            labels={{ pay: t('billing.payNow'), processing: t('common.saving') }}
          />
        </div>
      ) : null}
    </main>
  );
}
