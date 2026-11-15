package com.rentacar.app.agentdev

import com.rentacar.app.data.Branch
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleCommissionPayment
import com.rentacar.app.data.CarType
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * AGENT-101 (AgentDev only). Pure, deterministic fixture rows for the offline emulator APK.
 *
 * No Android, Room or clock access: every row uses a fixed primary key and fixed timestamps so
 * seeding is idempotent and unit-testable on the JVM. All rows are owned by [uid].
 */
object AgentDevFixtureData {

    data class Fixture(
        val uid: String,
        val suppliers: List<Supplier>,
        val branches: List<Branch>,
        val carTypes: List<CarType>,
        val customers: List<Customer>,
        val reservations: List<Reservation>,
        val carSales: List<CarSale>,
        val commissionPayments: List<CarSaleCommissionPayment>
    )

    const val SUPPLIER_ALPHA_ID = 9001L
    const val SUPPLIER_BETA_ID = 9002L
    const val SUPPLIER_GAMMA_ID = 9003L

    const val CAR_SALE_UNPAID_ID = 9501L
    const val CAR_SALE_PARTIAL_ID = 9502L
    const val CAR_SALE_PAID_ID = 9503L

    private fun day(year: Int, month: Int, dayOfMonth: Int): Long =
        LocalDate.of(year, month, dayOfMonth).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    /** Fixed "created/updated" instant so rows never depend on wall-clock time. */
    private val CREATED_AT = day(2026, 1, 1)

    fun build(uid: String): Fixture {
        require(uid.isNotBlank()) { "uid is required" }

        val suppliers = listOf(
            Supplier(
                id = SUPPLIER_ALPHA_ID, name = "Alpha Rentals", address = "1 Alpha St, Tel Aviv",
                taxId = "510000001", phone = "03-5550001", email = "ops@alpha.example.test",
                commissionDays1to6 = 15, commissionDays7to23 = 10, commissionDays24plus = 7,
                userUid = uid
            ),
            // Supplier has no "active" column; Beta is the sparsely configured one (no commission %).
            Supplier(
                id = SUPPLIER_BETA_ID, name = "Beta Cars", address = "2 Beta Rd, Haifa",
                taxId = "510000002", phone = "04-5550002", email = "ops@beta.example.test",
                userUid = uid
            ),
            Supplier(
                id = SUPPLIER_GAMMA_ID, name = "Gamma Mobility", address = "3 Gamma Ave, Jerusalem",
                taxId = "510000003", phone = "02-5550003", email = "ops@gamma.example.test",
                commissionDays1to6 = 12, commissionDays7to23 = 9, commissionDays24plus = 6,
                userUid = uid
            )
        )

        val branches = listOf(
            Branch(id = 9101, name = "Alpha TLV", city = "Tel Aviv", supplierId = SUPPLIER_ALPHA_ID, userUid = uid),
            Branch(id = 9102, name = "Beta HFA", city = "Haifa", supplierId = SUPPLIER_BETA_ID, userUid = uid),
            Branch(id = 9103, name = "Gamma JLM", city = "Jerusalem", supplierId = SUPPLIER_GAMMA_ID, userUid = uid)
        )

        val carTypes = listOf(
            CarType(id = 9201, name = "Economy", userUid = uid),
            CarType(id = 9202, name = "SUV", userUid = uid)
        )

        val customers = listOf(
            Customer(
                id = 9301, firstName = "Dana", lastName = "Levi", phone = "050-0000001",
                tzId = "000000018", email = "dana.levi@example.test",
                createdAt = CREATED_AT, updatedAt = CREATED_AT, userUid = uid
            ),
            Customer(
                id = 9302, firstName = "Omer", lastName = "Cohen", phone = "050-0000002",
                email = "omer.cohen@example.test", isCompany = true,
                createdAt = CREATED_AT, updatedAt = CREATED_AT, userUid = uid
            ),
            Customer(
                id = 9303, firstName = "Noa", lastName = "Mizrahi", phone = "050-0000003",
                active = false,
                createdAt = CREATED_AT, updatedAt = CREATED_AT, userUid = uid
            )
        )

        fun reservation(
            id: Long,
            customerId: Long,
            supplierId: Long,
            branchId: Long,
            carTypeId: Long,
            carTypeName: String,
            from: Long,
            to: Long,
            price: Double,
            status: ReservationStatus,
            orderNumber: String?,
            contractNumber: String?,
            isClosed: Boolean = false,
            actualReturn: Long? = null,
            notes: String? = null
        ) = Reservation(
            id = id, customerId = customerId, supplierId = supplierId, branchId = branchId,
            carTypeId = carTypeId, carTypeName = carTypeName, dateFrom = from, dateTo = to,
            actualReturnDate = actualReturn, agreedPrice = price, kmIncluded = 1000,
            requiredHoldAmount = 2000, periodTypeDays = 1, status = status, isClosed = isClosed,
            supplierOrderNumber = orderNumber, externalContractNumber = contractNumber,
            notes = notes, createdAt = CREATED_AT, updatedAt = CREATED_AT, userUid = uid
        )

        val reservations = listOf(
            reservation(
                9401, 9301, SUPPLIER_ALPHA_ID, 9101, 9201, "Economy",
                day(2026, 3, 1), day(2026, 3, 5), 1200.0, ReservationStatus.Draft,
                orderNumber = null, contractNumber = null, notes = "agentdev draft"
            ),
            reservation(
                9402, 9301, SUPPLIER_ALPHA_ID, 9101, 9202, "SUV",
                day(2026, 3, 10), day(2026, 3, 17), 2800.0, ReservationStatus.SentToSupplier,
                orderNumber = "ORD-ALPHA-1002", contractNumber = "EXT-A-5002"
            ),
            reservation(
                9403, 9302, SUPPLIER_BETA_ID, 9102, 9201, "Economy",
                day(2026, 4, 2), day(2026, 4, 9), 2100.0, ReservationStatus.Confirmed,
                orderNumber = "ORD-BETA-2001", contractNumber = "EXT-B-6001"
            ),
            reservation(
                9404, 9302, SUPPLIER_BETA_ID, 9102, 9202, "SUV",
                day(2026, 4, 15), day(2026, 4, 22), 3300.0, ReservationStatus.Paid,
                orderNumber = "ORD-BETA-2002", contractNumber = "EXT-B-6002",
                isClosed = true, actualReturn = day(2026, 4, 22)
            ),
            reservation(
                9405, 9303, SUPPLIER_GAMMA_ID, 9103, 9201, "Economy",
                day(2026, 5, 1), day(2026, 5, 3), 900.0, ReservationStatus.Cancelled,
                orderNumber = "ORD-GAMMA-3001", contractNumber = "EXT-G-7001",
                isClosed = true, notes = "agentdev cancelled"
            ),
            reservation(
                9406, 9301, SUPPLIER_GAMMA_ID, 9103, 9202, "SUV",
                day(2026, 6, 1), day(2026, 6, 30), 9800.0, ReservationStatus.SentToCustomer,
                orderNumber = "ORD-GAMMA-3002", contractNumber = "EXT-G-7002"
            )
        )

        fun sale(id: Long, first: String, last: String, price: Double, commission: Double, date: Long) =
            CarSale(
                id = id, firstName = first, lastName = last, phone = "052-$id",
                carTypeName = "Used Hatchback", saleDate = date, salePrice = price,
                commissionPrice = commission, createdAt = CREATED_AT, updatedAt = CREATED_AT,
                userUid = uid
            )

        val carSales = listOf(
            sale(CAR_SALE_UNPAID_ID, "Yael", "Barak", 60000.0, 1000.0, day(2026, 2, 1)),
            sale(CAR_SALE_PARTIAL_ID, "Eli", "Shalom", 90000.0, 2000.0, day(2026, 2, 10)),
            sale(CAR_SALE_PAID_ID, "Tali", "Gold", 75000.0, 1500.0, day(2026, 2, 20))
        )

        fun payment(id: Long, saleId: Long, amount: Double, date: Long) = CarSaleCommissionPayment(
            id = id, carSaleId = saleId, amount = amount, paymentDate = date,
            createdAt = CREATED_AT, updatedAt = CREATED_AT, userUid = uid
        )

        // UNPAID: sale 9501 has no payment rows.
        // PARTIAL: sale 9502 -> 500 + 700 of 2000.
        // PAID:    sale 9503 -> 1500 of 1500.
        val commissionPayments = listOf(
            payment(9601, CAR_SALE_PARTIAL_ID, 500.0, day(2026, 3, 1)),
            payment(9602, CAR_SALE_PARTIAL_ID, 700.0, day(2026, 3, 15)),
            payment(9603, CAR_SALE_PAID_ID, 1500.0, day(2026, 3, 20))
        )

        return Fixture(uid, suppliers, branches, carTypes, customers, reservations, carSales, commissionPayments)
    }
}
