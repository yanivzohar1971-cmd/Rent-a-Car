package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.ports.ReportingReadPort
import com.rentacar.app.reports.dto.MonthlyReportResult
import com.rentacar.app.reports.dto.MonthlySummaryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLocalReportingExecutorTest {
    @Test
    fun reportPortReceivesExplicitAuthUid() {
        var uidSeen = ""
        val port = object : ReportingReadPort {
            override suspend fun monthlyReport(
                userUid: String, supplierId: Long, year: Int, month: Int
            ): MonthlyReportResult {
                uidSeen = userUid
                return MonthlyReportResult(
                    "Supplier", year, month,
                    MonthlySummaryDto(1, 1, 0, 0, 100.0, 10.0),
                    emptyList()
                )
            }
        }
        val api = RentCarAgentAPI.forAndroidLocalReads(
            EmptySupplierPort, EmptyReservationPort, reportingReadPort = port
        )
        val response = api.execute(batchRequest(
            "report.monthly.view", mapOf("supplierId" to 1, "year" to 2026, "month" to 2)
        ))
        assertTrue(response.success)
        assertEquals(BATCH_UID, uidSeen)
    }
}
