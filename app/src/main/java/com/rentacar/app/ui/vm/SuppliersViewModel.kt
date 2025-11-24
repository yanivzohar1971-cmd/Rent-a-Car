package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.SupplierRepository
import com.rentacar.app.data.SupplierPriceListDao
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SuppliersViewModel(
    private val repo: SupplierRepository, 
    private val catalog: CatalogRepository,
    private val priceListDao: SupplierPriceListDao? = null
) : ViewModel() {
    val list: StateFlow<List<Supplier>> = repo.list().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun supplier(id: Long) = repo.getById(id)

    fun save(supplier: Supplier, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val isNewSupplier = supplier.id == 0L
            val supplierId = repo.upsert(supplier)
            
            // אם זה ספק חדש, צור סניף ראשי אוטומטית
            if (isNewSupplier) {
                // צור סניף ראשי עם פרטי הספק
                val mainBranch = Branch(
                    name = "סניף ראשי",
                    address = supplier.address,
                    city = null,
                    street = null,
                    phone = supplier.phone,
                    supplierId = supplierId
                )
                catalog.upsertBranch(mainBranch)
            }
            
            onDone(supplierId)
        }
    }

    fun delete(id: Long, onDone: (Boolean) -> Unit = {}) {
        viewModelScope.launch { onDone(repo.delete(id) > 0) }
    }

    fun branches(supplierId: Long) = catalog.branchesBySupplier(supplierId)

    fun addBranch(supplierId: Long, name: String, city: String?, street: String?, phone: String?, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            // כל סניף הוא רשומה נפרדת - אין בדיקת כפילות
            val b = Branch(
                name = name,
                address = null,
                city = city?.ifBlank { null },
                street = street?.ifBlank { null },
                phone = phone?.ifBlank { null },
                supplierId = supplierId
            )
            val id = catalog.upsertBranch(b)
            onDone(id)
        }
    }

    fun deleteBranch(id: Long, onDone: (Boolean) -> Unit = {}) {
        viewModelScope.launch { onDone(catalog.deleteBranch(id) > 0) }
    }

    fun updateBranch(branch: Branch, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertBranch(branch)
            onDone(id)
        }
    }

    fun onSupplierPriceListClick(
        supplierId: Long,
        openPriceListDetails: (Long) -> Unit,
        openPriceListManagement: (Long) -> Unit
    ) {
        viewModelScope.launch {
            val lastHeader = priceListDao?.getLastHeaderForSupplier(supplierId)
            if (lastHeader != null) {
                openPriceListDetails(lastHeader.id)
            } else {
                openPriceListManagement(supplierId)
            }
        }
    }
}


