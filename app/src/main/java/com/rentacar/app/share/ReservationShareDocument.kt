package com.rentacar.app.share

data class StyledShareLine(
    val text: String,
    val bold: Boolean = false,
    val colorArgb: Int? = null
)

data class ReservationShareFacts(
    val isQuote: Boolean = false,
    val reservationId: Long? = null,
    val customerFirstName: String = "",
    val customerLastName: String = "",
    val customerPhone: String = "",
    val customerTzId: String? = null,
    val fromDate: String = "",
    val toDate: String = "",
    val fromTime: String = "",
    val toTime: String = "",
    val days: Int = 0,
    val supplierName: String = "",
    val branchName: String = "",
    val branchStreet: String? = null,
    val branchPhone: String? = null,
    val airportMode: Boolean = false,
    val carType: String = "",
    val agreedPrice: Double = 0.0,
    val kmIncluded: Int? = null,
    val requiredHoldAmount: Int = 0,
    val supplierOrderNumber: String? = null,
    val notes: String? = null,
    val language: ShareLanguage = ShareLanguage.HE
) {
    val customerName: String
        get() = listOf(customerFirstName, customerLastName)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(" ")

    fun toResolutionContext(): TemplateResolutionContext = TemplateResolutionContext(
        language = language,
        holdAmount = requiredHoldAmount,
        supplierName = supplierName,
        branchName = branchName,
        customerName = customerName,
        price = agreedPrice,
        carType = carType
    )
}

data class ReservationShareDocument(
    val language: ShareLanguage,
    val rtl: Boolean,
    val heading: String?,
    val baseLines: List<StyledShareLine>,
    val termsHeading: StyledShareLine?,
    val terms: List<StyledShareLine>
) {
    fun toStyledLines(): List<StyledShareLine> = buildList {
        heading?.let { add(StyledShareLine(it, bold = true)) }
        addAll(baseLines)
        if (termsHeading != null || terms.isNotEmpty()) {
            add(StyledShareLine(""))
            termsHeading?.let { add(it) }
            addAll(terms)
        }
    }

    fun toPlainText(): String =
        toStyledLines().joinToString("\n") { it.text }

    fun toPlainLines(): List<String> = toStyledLines().map { it.text }
}

object CustomerReservationComposer {
    fun compose(
        facts: ReservationShareFacts,
        effectiveTerms: EffectiveCustomerTerms
    ): ReservationShareDocument {
        val language = facts.language
        val rtl = language == ShareLanguage.HE
        val context = facts.toResolutionContext()
        return ReservationShareDocument(
            language = language,
            rtl = rtl,
            heading = null,
            baseLines = baseLines(facts).map { StyledShareLine(it) },
            termsHeading = StyledShareLine(CustomerTermsDefaults.heading(language), bold = true),
            terms = renderTerms(effectiveTerms, context)
        )
    }

    fun renderTerms(
        effectiveTerms: EffectiveCustomerTerms,
        context: TemplateResolutionContext
    ): List<StyledShareLine> {
        var number = 1
        val rendered = mutableListOf<StyledShareLine>()
        for (term in effectiveTerms.terms.sortedBy { it.sortOrder }) {
            if (!term.enabled) continue
            val resolved = TemplateResolver.resolve(term.textTemplate, context).trim()
            if (resolved.isEmpty()) continue
            val numbered = numberBody(number, resolved)
            rendered.add(
                StyledShareLine(
                    text = numbered,
                    bold = term.bold,
                    colorArgb = term.textColorArgb
                )
            )
            number++
        }
        return rendered
    }

    private fun numberBody(number: Int, body: String): String {
        val parts = body.split('\n')
        if (parts.isEmpty()) return "$number. "
        val first = "$number. ${parts.first()}"
        if (parts.size == 1) return first
        val indent = " ".repeat(number.toString().length + 2)
        return (listOf(first) + parts.drop(1).map { indent + it }).joinToString("\n")
    }

    private fun baseLines(facts: ReservationShareFacts): List<String> {
        val customerName = facts.customerName
        val tz = facts.customerTzId.orEmpty()
        val km = facts.kmIncluded
        return if (facts.language == ShareLanguage.HE) {
            buildList {
                add(hebrewTitle(facts))
                add("שם מלא: $customerName")
                add("טלפון: ${facts.customerPhone}")
                add("ת" + "עודת זהות: $tz")
                add("תאריך התחלה: ${facts.fromDate}")
                add("תאריך סיום: ${facts.toDate}")
                add("שעת יציאה: ${facts.fromTime}")
                add("שעת חזרה: ${facts.toTime}")
                add("ימים: ${facts.days}")
                add("ספק: ${facts.supplierName}")
                add("סניף: ${facts.branchName}")
                if (!facts.airportMode && !facts.branchStreet.isNullOrBlank()) {
                    add("רחוב סניף: ${facts.branchStreet}")
                }
                if (!facts.airportMode && !facts.branchPhone.isNullOrBlank()) {
                    add("טלפון סניף: ${facts.branchPhone}")
                }
                add("סוג רכב: ${facts.carType}")
                add("מחיר מסוכם: ${facts.agreedPrice.toInt()} ₪")
                if (km != null) add("ק" + "מ כלול: $km")
                facts.supplierOrderNumber?.takeIf { it.isNotBlank() }?.let {
                    add("מס׳ הזמנה מהספק: $it")
                }
                facts.notes?.takeIf { it.isNotBlank() }?.let { add("הערות: $it") }
            }
        } else {
            buildList {
                add(englishTitle(facts))
                add("Full name: $customerName")
                add("Phone: ${facts.customerPhone}")
                add("ID: $tz")
                add("Start date: ${facts.fromDate}")
                add("End date: ${facts.toDate}")
                add("Pickup time: ${facts.fromTime}")
                add("Return time: ${facts.toTime}")
                add("Days: ${facts.days}")
                add("Supplier: ${facts.supplierName}")
                add("Branch: ${facts.branchName}")
                if (!facts.airportMode && !facts.branchStreet.isNullOrBlank()) {
                    add("Branch street: ${facts.branchStreet}")
                }
                if (!facts.airportMode && !facts.branchPhone.isNullOrBlank()) {
                    add("Branch phone: ${facts.branchPhone}")
                }
                add("Car type: ${facts.carType}")
                add("Agreed price: ₪${facts.agreedPrice.toInt()}")
                if (km != null) add("Included km: $km")
                facts.supplierOrderNumber?.takeIf { it.isNotBlank() }?.let {
                    add("Supplier order #: $it")
                }
                facts.notes?.takeIf { it.isNotBlank() }?.let { add("Notes: $it") }
            }
        }
    }

    private fun hebrewTitle(facts: ReservationShareFacts): String {
        val kind = if (facts.isQuote) "הצעת מחיר" else "הזמנה"
        return facts.reservationId?.let { "$kind #$it" } ?: kind
    }

    private fun englishTitle(facts: ReservationShareFacts): String {
        val kind = if (facts.isQuote) "Quote" else "Reservation"
        return facts.reservationId?.let { "$kind #$it" } ?: kind
    }
}

object TermColorPalette {
    data class Swatch(val argb: Int?, val labelHe: String, val labelEn: String)

    val SWATCHES: List<Swatch> = listOf(
        Swatch(null, "ברירת מחדל", "Default"),
        Swatch(0xFF8B0000.toInt(), "אדום כהה", "Dark red"),
        Swatch(0xFFD32F2F.toInt(), "אדום", "Red"),
        Swatch(0xFF1565C0.toInt(), "כחול כהה", "Dark blue"),
        Swatch(0xFF2E7D32.toInt(), "ירוק כהה", "Dark green"),
        Swatch(0xFFEF6C00.toInt(), "כתום", "Orange")
    )
}
