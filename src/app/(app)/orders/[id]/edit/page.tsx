import { OrderFormPage } from "@/components/orders/order-form-page";
export default async function EditOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ customer?: string; vehicle?: string }> }) {
  return <OrderFormPage orderId={(await params).id} search={await searchParams} />;
}
