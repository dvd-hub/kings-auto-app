import { OrderFormPage } from "@/components/orders/order-form-page";
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string; vehicle?: string }> }) {
  return <OrderFormPage search={await searchParams} />;
}
