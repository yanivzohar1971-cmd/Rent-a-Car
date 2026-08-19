package com.rentacar.app.emailimport.clipboard

object ShagrirClipboardFixtures {

    val HEADERS_CANONICAL = listOf(
        "מספר הזמנה",
        "עמלה",
        "סהכ ימים לחישוב עמלות",
        "שם מנוי",
        "מספר חשבונית",
        "סה\"כ הכנסה מהשכרה לפניי מע\"מ",
        "אחוז",
        "שם סוכן"
    )

    fun gmailNoisePrefix(): String = """
        None selected

        Skip to content

        Using Gmail with screen readers

        Inbox

        assaft@shagrir.co.il

        Jul 31, 2026

        to me

        no subject
    """.trimIndent()

    fun gmailNoiseSuffix(): String = """
        שגריר

        Get Outlook for Android
    """.trimIndent()

    fun cellsToClipboard(values: List<String>): String =
        values.joinToString("\n\n") { it }

    fun row(
        order: String,
        commission: String,
        days: String,
        customer: String,
        invoice: String,
        revenue: String,
        percent: String,
        agent: String
    ): List<String> = listOf(order, commission, days, customer, invoice, revenue, percent, agent)

    fun realisticReport(
        headers: List<String> = HEADERS_CANONICAL,
        includeClipping: Boolean = false,
        extraBlankLines: Boolean = false,
        incompleteFinal: Boolean = false
    ): String {
        val rows = listOf(
            row("28004", "174.993", "30", "לקוח אלפא", "3398978", "2499.9", "0.07", "סוכן אלפא"),
            row("27948", "147", "10", "לקוח בית", "1001", "2100", "0.07", "סוכן בית"),
            row("27948", "24.5", "5", "לקוח בית", "1002", "350", "0.07", "סוכן בית"),
            row("3839", "11.6662", "3", "חברת \"אלדן\"", "555", "166.66", "0.07", "עידן זוהר"),
            row("27182", "150", "14", "לקוח גימל", "777", "1000", "0.15", "סוכן גימל")
        )
        val totals = listOf("סה\"כ", "508.1592", "", "", "", "6116.56", "", "")
        val parts = mutableListOf<String>()
        parts += gmailNoisePrefix()
        parts += cellsToClipboard(headers)
        rows.forEach { parts += cellsToClipboard(it) }
        if (incompleteFinal) {
            parts += cellsToClipboard(listOf("99999", "1", "1", "חלקי", "1", "1", "0.07"))
        } else {
            parts += cellsToClipboard(totals)
            parts += gmailNoiseSuffix()
        }
        if (includeClipping) {
            parts += "[Message clipped]\nView entire message"
        }
        val joined = parts.joinToString(if (extraBlankLines) "\n\n\n" else "\n\n")
        return joined
    }

    fun reportFromRows(
        rows: List<List<String>>,
        headers: List<String> = HEADERS_CANONICAL,
        suffix: String = gmailNoiseSuffix(),
        prefix: String = gmailNoisePrefix(),
        totals: List<String>? = null
    ): String {
        val parts = mutableListOf<String>()
        parts += prefix
        parts += cellsToClipboard(headers)
        rows.forEach { parts += cellsToClipboard(it) }
        if (totals != null) parts += cellsToClipboard(totals)
        if (suffix.isNotBlank()) parts += suffix
        return parts.joinToString("\n\n")
    }
}
