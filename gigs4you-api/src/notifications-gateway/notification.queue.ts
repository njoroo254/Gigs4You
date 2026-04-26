export const NOTIFICATION_QUEUE = 'notifications';

export const NotifJob = {
  SMS:   'sms',
  EMAIL: 'email',
} as const;

export interface SmsJobData {
  phone:   string;
  message: string;
}

export interface EmailJobData {
  to:      string;
  subject: string;
  text:    string;
  html?:   string;
}
