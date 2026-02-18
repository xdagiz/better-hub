import { getNotifications } from "@/lib/github";
import { NotificationsContent } from "@/components/notifications/notifications-content";

export default async function NotificationsPage() {
  const notifications = await getNotifications(50);
  return <NotificationsContent notifications={notifications as any} />;
}
