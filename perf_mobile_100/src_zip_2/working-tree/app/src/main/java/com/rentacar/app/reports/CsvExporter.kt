package com.rentacar.app.reports

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Reservation
import java.io.File

object CsvExporter {
    private fun writeTextToCache(context: Context, fileName: String, content: String): Uri {
        val dir = File(context.cacheDir, "shared"); if (!dir.exists()) dir.mkdirs()
        val file = File(dir, fileName)
        file.writeText(content)
        return FileProvider.getUriForFile(context, "com.rentacar.app.fileprovider", file)
    }

    fun exportReservations(context: Context, reservations: List<Reservation>): Uri {
        val headers = listOf(
            "id","customerId","supplierId","branchId","carTypeId","dateFrom","dateTo","actualReturnDate","agreedPrice","kmIncluded","requiredHoldAmount","status","supplierOrderNumber","notes","isQuote"
        )
        val lines = buildList {
            add(headers.joinToString(","))
            reservations.forEach { r ->
                add(
                    listOf(
                        r.id, r.customerId, r.supplierId, r.branchId, r.carTypeId,
                        r.dateFrom, r.dateTo, r.actualReturnDate?:"", r.agreedPrice, r.kmIncluded,
                        r.requiredHoldAmount, r.status, r.supplierOrderNumber ?: "", r.notes ?: "", r.isQuote
                    ).joinToString(",")
                )
            }
        }.joinToString("\n")

        return writeTextToCache(context, "reservations.csv", lines)
    }

    fun exportCustomers(context: Context, customers: List<com.rentacar.app.data.Customer>): Uri {
        val headers = listOf("id","firstName","lastName","phone","tzId","address","email","active","createdAt","updatedAt")
        val lines = buildList {
            add(headers.joinToString(","))
            customers.forEach { c ->
                add(listOf(c.id, c.firstName, c.lastName, c.phone, c.tzId ?: "", c.address ?: "", c.email ?: "", c.active, c.createdAt, c.updatedAt).joinToString(","))
            }
        }.joinToString("\n")
        return writeTextToCache(context, "customers.csv", lines)
    }

    fun exportSuppliers(context: Context, suppliers: List<com.rentacar.app.data.Supplier>): Uri {
        val headers = listOf("id","name","phone","address","taxId","email","defaultHold","fixedHold")
        val lines = buildList {
            add(headers.joinToString(","))
            suppliers.forEach { s ->
                add(listOf(s.id, s.name, s.phone ?: "", s.address ?: "", s.taxId ?: "", s.email ?: "", s.defaultHold, s.fixedHold ?: "").joinToString(","))
            }
        }.joinToString("\n")
        return writeTextToCache(context, "suppliers.csv", lines)
    }

    fun exportBranches(context: Context, branches: List<com.rentacar.app.data.Branch>): Uri {
        val headers = listOf("id","name","address","supplierId")
        val lines = buildList {
            add(headers.joinToString(","))
            branches.forEach { b -> add(listOf(b.id, b.name, b.address ?: "", b.supplierId).joinToString(",")) }
        }.joinToString("\n")
        return writeTextToCache(context, "branches.csv", lines)
    }

    fun exportCarTypes(context: Context, types: List<com.rentacar.app.data.CarType>): Uri {
        val headers = listOf("id","name")
        val lines = buildList {
            add(headers.joinToString(","))
            types.forEach { t -> add(listOf(t.id, t.name).joinToString(",")) }
        }.joinToString("\n")
        return writeTextToCache(context, "car_types.csv", lines)
    }

    fun exportPayments(context: Context, payments: List<com.rentacar.app.data.Payment>): Uri {
        val headers = listOf("id","reservationId","amount","date","method","note")
        val lines = buildList {
            add(headers.joinToString(","))
            payments.forEach { p -> add(listOf(p.id, p.reservationId, p.amount, p.date, p.method, p.note ?: "").joinToString(",")) }
        }.joinToString("\n")
        return writeTextToCache(context, "payments.csv", lines)
    }

    fun exportCarSales(context: Context, carSales: List<com.rentacar.app.data.CarSale>): Uri {
        val headers = listOf("id","firstName","lastName","phone","carTypeName","saleDate","salePrice","commissionPrice","notes","createdAt","updatedAt")
        val lines = buildList {
            add(headers.joinToString(","))
            carSales.forEach { s -> add(listOf(s.id, s.firstName, s.lastName, s.phone, s.carTypeName, s.saleDate, s.salePrice, s.commissionPrice, s.notes ?: "", s.createdAt, s.updatedAt).joinToString(",")) }
        }.joinToString("\n")
        return writeTextToCache(context, "car_sales.csv", lines)
    }

    fun exportRequests(context: Context, requests: List<com.rentacar.app.data.Request>): Uri {
        val headers = listOf("id","isPurchase","isQuote","firstName","lastName","phone","carTypeName","createdAt")
        val lines = buildList {
            add(headers.joinToString(","))
            requests.forEach { r -> add(listOf(r.id, r.isPurchase, r.isQuote, r.firstName, r.lastName, r.phone, r.carTypeName, r.createdAt).joinToString(",")) }
        }.joinToString("\n")
        return writeTextToCache(context, "requests.csv", lines)
    }

    fun shareCsv(context: Context, uri: Uri) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "שיתוף CSV"))
    }
}


