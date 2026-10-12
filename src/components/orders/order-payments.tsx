import { getT } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatPaymentNumber } from "@/lib/format";
import { balanceStatus, paymentStatusVariants, type Payment } from "@/lib/payments";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentButtons, VoidPaymentButton } from "@/components/orders/payment-controls";

export async function OrderPayments({ orderId, cancelled, payerName, claimNumber }: {
  orderId: string; cancelled: boolean; payerName: string; claimNumber: string;
}) {
  const t = await getT();
  const supabase = await createClient();
  const [balanceResult, paymentsResult] = await Promise.all([
    supabase.from("ro_balances").select("*").eq("repair_order_id", orderId).maybeSingle(),
    (async () => {
      const rows: Payment[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase.from("payments").select("*").eq("repair_order_id", orderId).is("deleted_at", null).order("paid_at", { ascending: false }).order("id").range(offset, offset + 999);
        if (result.error) return { data: rows, error: result.error };
        rows.push(...result.data);
        if (result.data.length < 1000) return { data: rows, error: null };
      }
    })(),
  ]);
  const balance = balanceResult.data;
  const failed = Boolean(balanceResult.error || paymentsResult.error || !balance);
  const status = balanceStatus(balance?.payment_status ?? null);
  return <section id="payments" className="scroll-mt-6 space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2>{t("payments.title")}</h2>{!failed && balance && <PaymentButtons orderId={orderId} cancelled={cancelled} balance={balance} payerName={payerName} claimNumber={claimNumber} />}</div>
    {failed ? <p role="alert">{t("errors.load")}</p> : balance && <>
      {balance.invoice_total_cents !== null ? <div className="flex flex-wrap items-center gap-6"><dl className="flex flex-wrap gap-6">
        {([["invoiceTotal", balance.invoice_total_cents], ["netPaid", balance.net_paid_cents ?? 0], ["balance", balance.balance_cents ?? 0]] as const).map(([label, amount]) => <div key={label}><dt className="text-sm text-secondary-foreground">{t(`payments.${label}`)}</dt><dd className="font-mono text-lg font-semibold">{formatMoney(amount)}</dd></div>)}
      </dl>{status && <StatusBadge variant={paymentStatusVariants[status]} label={t(`payments.status.${status}`)} />}</div> : <p className="font-semibold">{(balance.net_paid_cents ?? 0) > 0 ? t("payments.depositsReceived", { amount: formatMoney(balance.net_paid_cents!) }) : t("payments.noPayments")}</p>}
      {paymentsResult.data.length > 0 && <div className="min-w-0 overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{t("payments.title")}</caption><thead className="bg-muted text-secondary-foreground"><tr>{(["number", "date", "kindLabel", "methodLabel", "payerLabel", "reference", "amount", "actions"] as const).map(key => <th scope="col" key={key} className="px-3 py-3 font-semibold">{t(`payments.${key}`)}</th>)}</tr></thead>
        <tbody>{paymentsResult.data.map(payment => {
          const voided = payment.status === "voided";
          return <tr key={payment.id} className="border-t border-border align-top">
            <td className="min-w-44 px-3 py-3"><p className={`font-mono font-semibold ${voided ? "line-through" : ""}`}>{formatPaymentNumber(payment.payment_number)}</p>{voided && <><StatusBadge variant="neutral" label={t("payments.voided")} /><p className="mt-2 whitespace-pre-wrap break-words text-secondary-foreground">{t("payments.voidReason")}: {payment.void_reason}</p></>}</td>
            <td className={`whitespace-nowrap px-3 py-3 ${voided ? "line-through" : ""}`}>{formatDateTime(payment.paid_at)}</td>
            <td className={`px-3 py-3 ${voided ? "line-through" : ""}`}>{t(`payments.kind.${payment.kind}`)}</td>
            <td className={`px-3 py-3 ${voided ? "line-through" : ""}`}>{t(`payments.method.${payment.method}`)}</td>
            <td className={`min-w-36 px-3 py-3 ${voided ? "line-through" : ""}`}><p>{t(`payments.payer.${payment.payer}`)}</p>{payment.payer_name && <p className="break-words text-secondary-foreground">{payment.payer_name}</p>}</td>
            <td className={`max-w-48 break-words px-3 py-3 ${voided ? "line-through" : ""}`}>{payment.reference ?? t("common.none")}</td>
            <td className={`whitespace-nowrap px-3 py-3 font-mono ${voided ? "line-through" : ""}`}>{formatMoney(payment.kind === "refund" ? -payment.amount_cents : payment.amount_cents)}</td>
            <td className="px-3 py-3">{!voided && <VoidPaymentButton orderId={orderId} payment={payment} />}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </>}
  </section>;
}
