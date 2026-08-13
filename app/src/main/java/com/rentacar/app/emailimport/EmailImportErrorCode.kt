package com.rentacar.app.emailimport

enum class EmailImportErrorCode {
    MAILBOX_NOT_CONFIGURED,
    CREDENTIAL_STORE_FAILURE,
    INVALID_GMAIL_ACCOUNT,
    INVALID_APP_PASSWORD,
    AUTHENTICATION_FAILED,
    NETWORK_UNAVAILABLE,
    DNS_FAILURE,
    CONNECTION_TIMEOUT,
    SSL_FAILURE,
    TIMEOUT,
    MAILBOX_UNAVAILABLE,
    IMAP_CONNECTION_FAILED,
    INBOX_OPEN_FAILED,
    SEARCH_FAILED,
    MESSAGE_LOAD_FAILED,
    SUPPLIER_EMAIL_NOT_CONFIGURED,
    SUPPLIER_FORMAT_NOT_CONFIGURED,
    NO_MATCHING_MESSAGES,
    FORWARDED_SENDER_UNRESOLVED,
    SENDER_MISMATCH,
    MIME_PARSE_FAILED,
    NO_HTML_BODY,
    NO_HTML_TABLE,
    NO_XLSX_ATTACHMENT,
    AMBIGUOUS_XLSX_ATTACHMENTS,
    MALFORMED_XLSX,
    MALFORMED_HTML_TABLE,
    HTML_TABLE_PARSE_FAILED,
    XLSX_PARSE_FAILED,
    MISSING_REQUIRED_COLUMNS,
    UNSUPPORTED_SUPPLIER_PARSER,
    DUPLICATE_REPORT,
    UNKNOWN;

    fun hebrewMessage(): String = when (this) {
        MAILBOX_NOT_CONFIGURED -> "תיבת המייל אינה מוגדרת"
        CREDENTIAL_STORE_FAILURE -> "לא ניתן לקרוא את פרטי תיבת המייל השמורים"
        INVALID_GMAIL_ACCOUNT -> "כתובת Gmail אינה תקינה"
        INVALID_APP_PASSWORD -> "סיסמת אפליקציה אינה תקינה"
        AUTHENTICATION_FAILED -> "האימות לתיבת המייל נכשל"
        NETWORK_UNAVAILABLE -> "אין חיבור לרשת"
        DNS_FAILURE -> "לא ניתן לפתור את כתובת שרת המייל"
        CONNECTION_TIMEOUT -> "תם הזמן המוקצב לחיבור לתיבת המייל"
        SSL_FAILURE -> "שגיאת אבטחת חיבור (SSL)"
        TIMEOUT -> "תם הזמן המוקצב לפעולה"
        MAILBOX_UNAVAILABLE -> "תיבת המייל אינה זמינה"
        IMAP_CONNECTION_FAILED -> "החיבור לתיבת המייל נכשל"
        INBOX_OPEN_FAILED -> "לא ניתן לפתוח את תיבת הדואר הנכנס"
        SEARCH_FAILED -> "חיפוש ההודעות נכשל"
        MESSAGE_LOAD_FAILED -> "טעינת ההודעה נכשלה"
        SUPPLIER_EMAIL_NOT_CONFIGURED -> "לספק שנבחר לא הוגדרה כתובת אימייל לדוח עמלות"
        SUPPLIER_FORMAT_NOT_CONFIGURED -> "לספק שנבחר לא הוגדר סוג דוח עמלות"
        NO_MATCHING_MESSAGES -> "לא נמצאו הודעות תואמות"
        FORWARDED_SENDER_UNRESOLVED -> "לא ניתן לזהות את שולח ההודעה המקורית"
        SENDER_MISMATCH -> "כתובת השולח אינה תואמת לספק שנבחר"
        MIME_PARSE_FAILED -> "פענוח תוכן המייל נכשל"
        NO_HTML_BODY -> "לא נמצא תוכן HTML בגוף המייל"
        NO_HTML_TABLE -> "לא נמצאה טבלת HTML בגוף המייל"
        NO_XLSX_ATTACHMENT -> "לא נמצא קובץ Excel מצורף"
        AMBIGUOUS_XLSX_ATTACHMENTS -> "נמצאו מספר קבצי Excel מצורפים — יש לבחור אחד"
        MALFORMED_XLSX -> "קובץ ה-Excel פגום או לא תקין"
        MALFORMED_HTML_TABLE -> "טבלת ה-HTML פגומה או לא תקינה"
        HTML_TABLE_PARSE_FAILED -> "פענוח טבלת ה-HTML נכשל"
        XLSX_PARSE_FAILED -> "פענוח קובץ ה-Excel נכשל"
        MISSING_REQUIRED_COLUMNS -> "חסרות עמודות חובה בדוח"
        UNSUPPORTED_SUPPLIER_PARSER -> "אין פרסר נתמך לספק זה"
        DUPLICATE_REPORT -> "דוח זה כבר יובא"
        UNKNOWN -> "שגיאה לא ידועה בייבוא ממייל"
    }
}
