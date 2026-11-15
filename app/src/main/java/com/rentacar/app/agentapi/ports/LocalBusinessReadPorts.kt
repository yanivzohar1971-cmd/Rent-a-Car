package com.rentacar.app.agentapi.ports

import com.rentacar.app.data.Agent
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleRepository
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Request
import com.rentacar.app.data.RequestRepository
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierPriceListHeader
import com.rentacar.app.reports.dto.AgentBreakdownDto
import com.rentacar.app.reports.dto.MonthlyReportResult
import com.rentacar.app.reports.dto.MonthlySummaryDto
import kotlinx.coroutines.flow.first

interface FinanceReadPort {
    suspend fun reservations(userUid: String): List<Reservation>
    suspend fun salesWithPaidTotals(userUid: String): Pair<List<CarSale>, Map<Long, Double>>
}

interface SalesReadPort {
    suspend fun salesWithPaidTotals(userUid: String): Pair<List<CarSale>, Map<Long, Double>>
    suspend fun requests(userUid: String): List<Request>
}

interface FleetReadPort {
    suspend fun fleet(userUid: String): List<CarSale>
}

interface ReportingReadPort {
    suspend fun monthlyReport(userUid: String, supplierId: Long, year: Int, month: Int): MonthlyReportResult
}

interface CatalogAndReservationExtReadPort {
    suspend fun agents(userUid: String): List<Agent>
    suspend fun branches(userUid: String, supplierId: Long?): List<Branch>
    suspend fun suppliers(userUid: String): List<Supplier>
    suspend fun priceLists(userUid: String, supplierId: Long?): List<SupplierPriceListHeader>
    suspend fun reservations(userUid: String): List<Reservation>
    suspend fun reservationsByCustomer(userUid: String, customerId: Long): List<Reservation>
    suspend fun reservationsBySupplier(userUid: String, supplierId: Long): List<Reservation>
    suspend fun reservationsByAgent(userUid: String, agentId: Long): List<Reservation>
    suspend fun reservationsByBranch(userUid: String, branchId: Long): List<Reservation>
    suspend fun openReservations(userUid: String): List<Reservation>
    suspend fun payments(userUid: String, reservationId: Long): List<Payment>
    suspend fun customer(userUid: String, id: Long): Customer?
}

class RepositoryFinanceReadPort(
    private val reservationRepository: ReservationRepository,
    private val carSaleRepository: CarSaleRepository
) : FinanceReadPort {
    override suspend fun reservations(userUid: String) =
        reservationRepository.getAllReservationsForUser(userUid).first()

    override suspend fun salesWithPaidTotals(userUid: String) =
        carSaleRepository.listForUser(userUid).first() to
            carSaleRepository.paidTotalsBySale(userUid).first()
}

class RepositorySalesReadPort(
    private val carSaleRepository: CarSaleRepository,
    private val requestRepository: RequestRepository
) : SalesReadPort, FleetReadPort {
    override suspend fun salesWithPaidTotals(userUid: String) =
        carSaleRepository.listForUser(userUid).first() to
            carSaleRepository.paidTotalsBySale(userUid).first()

    override suspend fun requests(userUid: String) =
        requestRepository.listForUser(userUid).first()

    override suspend fun fleet(userUid: String) =
        carSaleRepository.listForUser(userUid).first()
}

class DaoReportingReadPort(private val db: AppDatabase) : ReportingReadPort {
    override suspend fun monthlyReport(
        userUid: String,
        supplierId: Long,
        year: Int,
        month: Int
    ): MonthlyReportResult {
        val supplierName = db.supplierDao().getSupplierNameById(supplierId, userUid) ?: "ספק לא ידוע"
        val deals = db.supplierMonthlyDealDao()
            .getBySupplierAndPeriod(supplierId, year, month, userUid).first()
        fun classification(status: String?): String {
            val normalized = status?.trim()?.lowercase().orEmpty()
            return when {
                normalized.contains("בוטל") || normalized.contains("cancel") ||
                    normalized.contains("מבוטל") -> "Cancelled"
                normalized.contains("שולם") || normalized.contains("paid") ||
                    normalized.contains("סגור") || normalized.contains("closed") -> "Paid"
                else -> "Confirmed"
            }
        }
        val classes = deals.map { classification(it.statusName) }
        val summary = MonthlySummaryDto(
            totalDeals = deals.size,
            totalConfirmed = classes.count { it == "Confirmed" },
            totalPaid = classes.count { it == "Paid" },
            totalCancelled = classes.count { it == "Cancelled" },
            totalGrossAmount = deals.sumOf { it.totalAmount },
            totalCommissionAmount = deals.sumOf { it.commissionAmount }
        )
        val breakdown = deals.groupBy { it.agentName }.map { (name, rows) ->
            val statuses = rows.map { classification(it.statusName) }
            AgentBreakdownDto(
                agentName = name,
                dealsCount = rows.size,
                grossAmountSum = rows.sumOf { it.totalAmount },
                commissionSum = rows.sumOf { it.commissionAmount },
                paidCount = statuses.count { it == "Paid" },
                cancelledCount = statuses.count { it == "Cancelled" },
                confirmedCount = statuses.count { it == "Confirmed" }
            )
        }.sortedByDescending { it.grossAmountSum }
        return MonthlyReportResult(supplierName, year, month, summary, breakdown)
    }
}

class RepositoryCatalogAndReservationExtReadPort(
    private val db: AppDatabase,
    private val catalogRepository: CatalogRepository,
    private val reservationRepository: ReservationRepository,
    private val customerRepository: CustomerRepository
) : CatalogAndReservationExtReadPort {
    override suspend fun agents(userUid: String) = catalogRepository.agentsForUser(userUid).first()
    override suspend fun branches(userUid: String, supplierId: Long?): List<Branch> =
        if (supplierId == null) db.branchDao().getAllOnce(userUid)
        else catalogRepository.branchesBySupplierForUser(supplierId, userUid).first()
    override suspend fun suppliers(userUid: String) = catalogRepository.suppliersForUser(userUid).first()
    override suspend fun priceLists(userUid: String, supplierId: Long?): List<SupplierPriceListHeader> {
        val ids = supplierId?.let(::listOf) ?: suppliers(userUid).map { it.id }
        return ids.flatMap { db.supplierPriceListDao().getHeadersForSupplier(it, userUid) }
            .sortedWith(compareByDescending<SupplierPriceListHeader> { it.year }
                .thenByDescending { it.month }.thenByDescending { it.createdAt })
    }
    override suspend fun reservations(userUid: String) =
        reservationRepository.getAllReservationsForUser(userUid).first()
    override suspend fun reservationsByCustomer(userUid: String, customerId: Long) =
        reservationRepository.getByCustomerForUser(customerId, userUid).first()
    override suspend fun reservationsBySupplier(userUid: String, supplierId: Long) =
        reservationRepository.getBySupplierForUser(supplierId, userUid).first()
    override suspend fun reservationsByAgent(userUid: String, agentId: Long) =
        reservationRepository.getByAgentForUser(agentId, userUid).first()
    override suspend fun reservationsByBranch(userUid: String, branchId: Long) =
        reservationRepository.getByBranchForUser(branchId, userUid).first()
    override suspend fun openReservations(userUid: String) =
        reservationRepository.getOpenReservationsForUser(userUid).first()
    override suspend fun payments(userUid: String, reservationId: Long) =
        reservationRepository.getPaymentsForUser(reservationId, userUid).first()
    override suspend fun customer(userUid: String, id: Long) =
        customerRepository.getByIdForUser(id, userUid).first()
}
