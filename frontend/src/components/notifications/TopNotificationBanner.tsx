import React from "react";
import styles from "../modals/Modal.module.css";

export interface UserJoinNotification {
  id: string;
  displayName: string;
}

interface TopNotificationBannerProps {
  notification: UserJoinNotification | null;
}

export const TopNotificationBanner: React.FC<TopNotificationBannerProps> = ({
  notification,
}) => {
  if (!notification) return null;

  return (
    <div className={styles.topJoinBanner} key={notification.id}>
      <div className={styles.bannerDot} />
      <div className={styles.bannerAvatar}>
        {notification.displayName.charAt(0).toUpperCase()}
      </div>
      <div className={styles.bannerText}>
        <strong>{notification.displayName}</strong> joined the room
      </div>
    </div>
  );
};
