package com.rentacar.app.agentapi.commands

import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.CarSaleCommissionPaymentLogic.PaymentStatus
import com.rentacar.app.data.CarSaleCommissionPaymentLogic.ValidationResult

/**
 * AGENT-114: calculation verification for adding one car-sale commission payment.
 *
 * Pure wrapper over the existing [CarSaleCommissionPaymentLogic] (the same rules the Sales screen
 * and `CarSaleRepository.saveSaleWithCommissionPayments` use). It contains NO formulas of its own:
 * status, remaining and over-payment checks all delegate to the existing logic, so
 * UNPAID / PARTIAL / PAID / NO_COMMISSION semantics (including [CarSaleCommissionPaymentLogic.MONEY_EPS])
 * stay identical to the app.
 */
object CommissionPaymentSafety {
    data class Verification(
        val allowed: Boolean,
        /** Hebrew message from the existing logic when [allowed] is false. */
        val rejectionMessageHe: String?,
        val statusBefore: PaymentStatus,
        val statusAfter: PaymentStatus,
        val totalPaidBefore: Double,
        val totalPaidAfter: Double,
        val remainingAfter: Double
    )

    fun verifyAdd(
        commissionPrice: Double,
        existingPaymentAmounts: List<Double>,
        amount: Double?,
        paymentDate: Long?
    ): Verification {
        val paidBefore = CarSaleCommissionPaymentLogic.totalPaid(existingPaymentAmounts)
        val statusBefore = CarSaleCommissionPaymentLogic.paymentStatus(commissionPrice, paidBefore)

        val amountCheck = CarSaleCommissionPaymentLogic.validatePaymentAmount(amount, commissionPrice, paidBefore)
        val dateCheck = CarSaleCommissionPaymentLogic.validatePaymentDate(paymentDate)
        val error = (amountCheck as? ValidationResult.Error) ?: (dateCheck as? ValidationResult.Error)
        if (error != null) {
            return Verification(
                allowed = false,
                rejectionMessageHe = error.messageHe,
                statusBefore = statusBefore,
                statusAfter = statusBefore,
                totalPaidBefore = paidBefore,
                totalPaidAfter = paidBefore,
                remainingAfter = CarSaleCommissionPaymentLogic.remaining(commissionPrice, paidBefore)
            )
        }
        val paidAfter = CarSaleCommissionPaymentLogic.totalPaid(existingPaymentAmounts + amount!!)
        return Verification(
            allowed = true,
            rejectionMessageHe = null,
            statusBefore = statusBefore,
            statusAfter = CarSaleCommissionPaymentLogic.paymentStatus(commissionPrice, paidAfter),
            totalPaidBefore = paidBefore,
            totalPaidAfter = paidAfter,
            remainingAfter = CarSaleCommissionPaymentLogic.remaining(commissionPrice, paidAfter)
        )
    }
}

/**
 * AGENT-114: PREPARE + PREVIEW spec for the registered WRITE operation `carSale.commissionPayment.add`.
 *
 * Validation here is shape-only and pure (no commission price is known yet). The authoritative
 * over-payment / status checks run at commit time against stored data via [CommissionPaymentSafety],
 * and only when [AgentDevWriteGate] is open. Production commits stay disabled.
 */
object CommissionPaymentWriteSpecs {
    const val CAR_SALE_COMMISSION_PAYMENT_ADD = "carSale.commissionPayment.add"
    private val allowed = setOf("carSaleId", "amount", "paymentDate", "idempotencyKey")

    fun carSaleCommissionPaymentAdd(): WriteCommandSpec = WriteCommandSpec(
        operationId = CAR_SALE_COMMISSION_PAYMENT_ADD,
        risk = CommandRisk.HARD,
        validate = this::validate,
        preview = { params ->
            val n = normalize(params)
            listOf(
                PreviewChange(
                    "CarSaleCommissionPayment", "carSaleId", null, n["carSaleId"]?.toString(),
                    "Attach a commission payment to CarSale#${n["carSaleId"]}"
                ),
                PreviewChange(
                    "CarSaleCommissionPayment", "amount", null, n["amount"]?.toString(),
                    "Amount is checked against the remaining commission at commit time"
                ),
                PreviewChange(
                    "CarSaleCommissionPayment", "paymentDate", null, n["paymentDate"]?.toString(),
                    "Set payment date"
                )
            )
        },
        normalize = this::normalize
    )

    fun all(): List<WriteCommandSpec> = listOf(carSaleCommissionPaymentAdd())

    private fun validate(params: Map<String, Any?>): List<String> {
        val problems = mutableListOf<String>()
        params.keys.filterNot { it in allowed }.sorted().takeIf { it.isNotEmpty() }?.let {
            problems += "unknown parameters: ${it.joinToString()}"
        }
        val saleId = CommandParams.asLong(params["carSaleId"])
        when {
            params["carSaleId"] == null -> problems += "carSaleId is required"
            saleId == null -> problems += "carSaleId must be a whole number"
            saleId <= 0L -> problems += "carSaleId must be positive"
        }
        val amount = CommandParams.asDouble(params["amount"])
        when {
            params["amount"] == null -> problems += "amount is required"
            amount == null -> problems += "amount must be a number"
            amount <= 0.0 -> problems += "amount must be greater than zero"
        }
        val date = CommandParams.asLong(params["paymentDate"])
        when {
            params["paymentDate"] == null -> problems += "paymentDate is required"
            date == null -> problems += "paymentDate must be epoch milliseconds"
            CarSaleCommissionPaymentLogic.validatePaymentDate(date) is ValidationResult.Error ->
                problems += "paymentDate must be a valid date"
        }
        return problems
    }

    private fun normalize(params: Map<String, Any?>): Map<String, Any?> = linkedMapOf<String, Any?>().also { out ->
        CommandParams.asLong(params["carSaleId"])?.let { out["carSaleId"] = it }
        CommandParams.asDouble(params["amount"])?.let { out["amount"] = it }
        CommandParams.asLong(params["paymentDate"])?.let { out["paymentDate"] = it }
    }
}

/** AGENT-113/114 + AGENT-051: every write spec the AgentDev pipeline prepares. */
object AgentDevWriteSpecs {
    fun all(): List<WriteCommandSpec> =
        SandboxWriteSpecs.all() + ReservationWriteSpecs.all() + CommissionPaymentWriteSpecs.all()
}
