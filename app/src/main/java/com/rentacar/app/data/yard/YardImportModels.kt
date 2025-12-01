package com.rentacar.app.data.yard

data class YardImportJob(
    val jobId: String = "",
    val createdAt: Long = 0L,
    val createdBy: String = "",
    val status: String = "UPLOADED", // UPLOADED | PREVIEW_READY | COMMITTED | FAILED
    val source: YardImportSource = YardImportSource(),
    val summary: YardImportSummary = YardImportSummary(),
    val error: YardImportError? = null
)

data class YardImportSource(
    val storagePath: String = "",
    val fileName: String = "",
    val importerId: String = "",
    val importerVersion: Int = 1
)

data class YardImportSummary(
    val rowsTotal: Int = 0,
    val rowsValid: Int = 0,
    val rowsWithWarnings: Int = 0,
    val rowsWithErrors: Int = 0,
    val carsToCreate: Int = 0,
    val carsToUpdate: Int = 0,
    val carsSkipped: Int = 0
)

data class YardImportError(
    val message: String = ""
)

data class YardImportPreviewRow(
    val rowIndex: Int = 0,
    val raw: Map<String, Any?> = emptyMap(),
    val normalized: YardImportNormalizedCar = YardImportNormalizedCar(),
    val issues: List<YardImportIssue> = emptyList(),
    val dedupeKey: String = ""
)

data class YardImportNormalizedCar(
    val license: String? = null,
    val licenseClean: String? = null,
    val manufacturer: String? = null,
    val model: String? = null,
    val year: Int? = null,
    val mileage: Int? = null,
    val gear: String? = null,
    val color: String? = null,
    val engineCc: Int? = null,
    val ownership: String? = null,
    val testUntil: String? = null, // ISO yyyy-MM-dd
    val hand: Int? = null,
    val trim: String? = null,
    val askPrice: Int? = null,
    val listPrice: Int? = null
)

data class YardImportIssue(
    val level: String = "WARNING", // WARNING | ERROR
    val code: String = "",
    val message: String = ""
)

data class YardImportJobInit(
    val jobId: String,
    val uploadPath: String
)

/**
 * Statistics snapshot after a successful import commit
 */
data class YardImportStats(
    val totalRows: Int,
    val validRows: Int,
    val carsCreated: Int,
    val carsUpdated: Int,
    val topModels: List<Pair<String, Int>>,
    val topManufacturers: List<Pair<String, Int>>
)

