package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.SupplierRepository
import com.rentacar.app.data.SupplierPriceListDao
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SuppliersViewModel(
    private val repo: SupplierRepository, 
    private val catalog: CatalogRepository,
    private val priceListDao: SupplierPriceListDao? = null
) : ViewModel() {
    
    companion object {
        private const val TAG = "SuppliersViewModel"
    }
    
    init {
        val currentUid = CurrentUserProvider.getCurrentUid()
        Log.d(TAG, "SuppliersViewModel initialized with currentUid=$currentUid")
        if (currentUid == null) {
            Log.w(TAG, "WARNING: SuppliersViewModel initialized with null currentUid - data will be empty")
        }
    }
    
    val list: StateFlow<List<Supplier>> = kotlinx.coroutines.flow.flow {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        Log.d(TAG, "SuppliersViewModel.list using currentUid=$currentUid")
        emitAll(repo.listForUser(currentUid))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun supplier(id: Long): Flow<Supplier?> {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        return repo.getByIdForUser(id, currentUid)
    }

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

    fun branches(supplierId: Long): Flow<List<Branch>> {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        return catalog.branchesBySupplierForUser(supplierId, currentUid)
    }

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
            val currentUid = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
            val lastHeader = priceListDao?.getLastHeaderForSupplier(supplierId, currentUid)
            if (lastHeader != null) {
                openPriceListDetails(lastHeader.id)
            } else {
                openPriceListManagement(supplierId)
            }
        }
    }
}


