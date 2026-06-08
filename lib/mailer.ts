import nodemailer from "nodemailer";

type MailAttachment = {
  filename: string;
  content: Buffer;
};

type MailOptions = {
  to: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
};

export function isMailerConfigured(): boolean {
  return Boolean(process.env.GMAIL_SENDER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const sender = process.env.GMAIL_SENDER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.trim();

  if (!sender || !appPassword) {
    throw new Error("GMAIL_SENDER and GMAIL_APP_PASSWORD must be set to send email.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: sender,
      pass: appPassword
    }
  });

  await transporter.sendMail({
    from: sender,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content
    }))
  });
}
