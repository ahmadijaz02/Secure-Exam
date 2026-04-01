import smtplib
import os
import mimetypes
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from datetime import datetime


def _build_html_email(subject, reason, timestamp, student_name=None,
                      roll_number=None, seat_number=None,
                      head_turn_escalated=False, head_turn_count=None,
                      window_seconds=60, has_evidence_image=False,
                      evidence_cid='evidence_image', dashboard_url=None):
    """Build a professional HTML email body for Level 2 alerts."""

    # Determine severity properties
    OBJECT_ALERTS = {'PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'}
    is_object = reason in OBJECT_ALERTS
    severity_label = 'CRITICAL ALERT' if is_object else 'ESCALATION ALERT'
    accent_color = '#d32f2f' if is_object else '#ed6c02'
    accent_bg = '#fef2f2' if is_object else '#fff7ed'

    # Friendly reason label
    REASON_MAP = {
        'PHONE_DETECTED': 'Mobile Phone Detected',
        'WATCH_DETECTED': 'Smartwatch Detected',
        'PAPER_PASSING': 'Unauthorized Material (Paper)',
        'HEAD_LEFT': 'Repeated Head Turn (Left)',
        'HEAD_RIGHT': 'Repeated Head Turn (Right)',
        'HAND_SIGNAL': 'Suspicious Hand Signalling',
        'HEAD_DOWN': 'Suspicious Posture (Head Down)'
    }
    friendly_reason = REASON_MAP.get(reason, reason)

    # Format timestamp
    try:
        if isinstance(timestamp, str):
            # Strip microseconds if present
            ts_display = timestamp.split('.')[0] if '.' in timestamp else timestamp
        else:
            ts_display = timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')
    except Exception:
        ts_display = str(timestamp)

    student_details = ""
    if student_name:
        student_details = f"""
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td valign="top" style="width: 130px; min-width: 130px; color: #757575; font-size: 13px; font-weight: 500; text-transform: uppercase;">Student Name</td>
                        <td valign="top" style="color: #212121; font-size: 14px; font-weight: 600; word-break: break-word;">{student_name}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td valign="top" style="width: 130px; min-width: 130px; color: #757575; font-size: 13px; font-weight: 500; text-transform: uppercase;">Roll Number</td>
                        <td valign="top" style="color: #212121; font-size: 14px; word-break: break-word;">{roll_number or 'N/A'}</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td valign="top" style="width: 130px; min-width: 130px; color: #757575; font-size: 13px; font-weight: 500; text-transform: uppercase;">Seat Number</td>
                        <td valign="top" style="color: #212121; font-size: 14px; word-break: break-word;">{seat_number or 'N/A'}</td>
                    </tr>
                </table>
            </td>
        </tr>
        """
    else:
        student_details = """
        <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e0e0e0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td valign="top" style="width: 130px; min-width: 130px; color: #757575; font-size: 13px; font-weight: 500; text-transform: uppercase;">Student</td>
                        <td valign="top" style="color: #212121; font-size: 14px; font-style: italic;">Unidentified</td>
                    </tr>
                </table>
            </td>
        </tr>
        """

    escalation_html = ''
    if head_turn_escalated and head_turn_count:
        escalation_html = f"""
        <tr>
            <td style="padding: 16px; margin-top: 20px; background-color: {accent_bg}; border-left: 4px solid {accent_color};">
                <p style="margin: 0; font-size: 14px; color: #212121; line-height: 1.5;">
                    <strong style="color: {accent_color}; display: block; margin-bottom: 4px;">Escalation Threshold Met</strong>
                    Student registered <strong>{head_turn_count}</strong> infractions within a <strong>{window_seconds}-second</strong> window.
                </p>
            </td>
        </tr>
        """

    evidence_html = ''
    if has_evidence_image:
        evidence_html = f"""
        <tr>
            <td style="padding: 24px 0 12px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #757575; text-transform: uppercase; letter-spacing: 0.5px;">Attached Evidence</h3>
                <div style="border: 1px solid #e0e0e0; border-radius: 4px; padding: 4px; background: #fafafa; text-align: center;">
                    <img src="cid:{evidence_cid}" alt="Incident Evidence" style="width: 100%; max-width: 100%; height: auto; display: block; border-radius: 2px;" />
                </div>
            </td>
        </tr>
        """

    dashboard_html = ''
    if dashboard_url:
        dashboard_html = f"""
        <tr>
            <td style="padding: 32px 0 16px 0; text-align: center;">
                <a href="{dashboard_url}" style="display: inline-block; background-color: #1a365d; color: #ffffff; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 4px; letter-spacing: 0.5px; width: 80%; max-width: 250px;">
                    ACCESS DASHBOARD
                </a>
            </td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; color: #333333;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f8; padding: 20px 10px;">
            <tr>
                <td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <!-- Header -->
                        <tr>
                            <td style="background-color: #0f172a; padding: 20px 24px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td valign="middle">
                                            <h1 style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 500; letter-spacing: 0.5px;">SECURE EXAM</h1>
                                        </td>
                                        <td align="right" valign="middle" style="white-space: nowrap;">
                                            <span style="display: inline-block; padding: 4px 10px; background-color: {accent_color}; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 3px; letter-spacing: 0.5px; white-space: nowrap;">{severity_label}</span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 24px;">
                                <h2 style="margin: 0 0 8px 0; font-size: 22px; color: #111827; font-weight: 600; line-height: 1.3;">{friendly_reason}</h2>
                                <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280;">Recorded at {ts_display}</p>
                                
                                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                                    {student_details}
                                </table>
                                
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    {escalation_html}
                                    {evidence_html}
                                    {dashboard_html}
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f8fafc; padding: 20px 24px; border-top: 1px solid #e2e8f0; text-align: center;">
                                <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                                    This is an automated security notification generated by the Secure Exam System.<br>
                                    Confidential and intended solely for authorized personnel.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    return html


def send_email_alert(subject, body, to_emails, attachment_path=None,
                     reason=None, timestamp=None, student_name=None,
                     roll_number=None, seat_number=None,
                     head_turn_escalated=False, head_turn_count=None,
                     window_seconds=60, dashboard_url=None):
    """Send a Level 2 alert email with optional evidence attachment.

    If ``reason`` is provided, a rich HTML email is generated.  Otherwise the
    plain-text ``body`` is used as a fallback.
    """
    smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', 587))
    smtp_username = os.environ.get('SMTP_USERNAME')
    smtp_password = os.environ.get('SMTP_PASSWORD')

    if not smtp_username or not smtp_password:
        print("[EMAIL] SMTP_USERNAME or SMTP_PASSWORD not configured – skipping email send.")
        return

    msg = MIMEMultipart('related')
    msg['From'] = smtp_username
    msg['To'] = ', '.join(to_emails)
    msg['Subject'] = subject

    # Determine if we have a valid evidence image
    evidence_path = None
    if attachment_path and os.path.isfile(attachment_path):
        evidence_path = attachment_path

    evidence_cid = 'evidence_screenshot'

    # Build HTML or fallback to plain text
    if reason:
        html_body = _build_html_email(
            subject=subject,
            reason=reason,
            timestamp=timestamp or datetime.utcnow(),
            student_name=student_name,
            roll_number=roll_number,
            seat_number=seat_number,
            head_turn_escalated=head_turn_escalated,
            head_turn_count=head_turn_count,
            window_seconds=window_seconds,
            has_evidence_image=evidence_path is not None,
            evidence_cid=evidence_cid,
            dashboard_url=dashboard_url,
        )
        # Attach HTML as an alternative part
        alt_part = MIMEMultipart('alternative')
        alt_part.attach(MIMEText(body, 'plain'))
        alt_part.attach(MIMEText(html_body, 'html'))
        msg.attach(alt_part)
    else:
        msg.attach(MIMEText(body, 'plain'))

    # Attach evidence image (inline CID + downloadable attachment)
    if evidence_path:
        try:
            mime_type, _ = mimetypes.guess_type(evidence_path)
            maintype, subtype = (mime_type or 'image/jpeg').split('/')

            with open(evidence_path, 'rb') as img_file:
                img_data = img_file.read()

            # Inline image (for HTML rendering)
            inline_img = MIMEImage(img_data, _subtype=subtype)
            inline_img.add_header('Content-ID', f'<{evidence_cid}>')
            inline_img.add_header('Content-Disposition', 'inline',
                                  filename=os.path.basename(evidence_path))
            msg.attach(inline_img)

            # Downloadable attachment
            attachment_part = MIMEBase('application', 'octet-stream')
            attachment_part.set_payload(img_data)
            encoders.encode_base64(attachment_part)
            attachment_part.add_header(
                'Content-Disposition',
                f'attachment; filename="evidence_{os.path.basename(evidence_path)}"'
            )
            msg.attach(attachment_part)

            print(f"[EMAIL] Evidence attached: {os.path.basename(evidence_path)}")
        except Exception as e:
            print(f"[EMAIL] Failed to attach evidence image: {e}")

    # Send
    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_username, smtp_password)
        server.sendmail(smtp_username, to_emails, msg.as_string())
        server.quit()
        print(f"[EMAIL] ✅ Sent to {to_emails} — {subject}")
    except smtplib.SMTPAuthenticationError as e:
        print(f"[EMAIL ERROR] Authentication failed. Check SMTP_USERNAME/SMTP_PASSWORD. Details: {e}")
    except smtplib.SMTPException as e:
        print(f"[EMAIL ERROR] SMTP error: {e}")
    except Exception as e:
        print(f"[EMAIL ERROR] Unexpected error: {e}")
