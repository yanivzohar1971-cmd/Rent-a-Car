package com.rentacar.app.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.Supplier
import com.rentacar.app.prefs.SettingsStore
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.BranchCard
import com.rentacar.app.ui.components.ListItemModel
import com.rentacar.app.ui.components.SupplierCard
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.ui.vm.SuppliersViewModel
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.delay
import java.io.File
import androidx.core.content.FileProvider
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.items
import android.util.Log
import androidx.compose.foundation.ExperimentalFoundationApi
import com.rentacar.app.data.SupplierDocumentsMetadataStore
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.aspectRatio
import java.text.SimpleDateFormat
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import android.graphics.Bitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Surface
import androidx.compose.material3.Divider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import com.rentacar.app.data.PriceListImportFunctionCodes

// Data class to represent a supplier document
// title comes from metadata and can be renamed freely
// Physical file is never renamed or moved
data class SupplierDocument(
    val title: String,        // logical display name from metadata
    val uri: Uri,             // FileProvider URI
    val file: File,           // physical file on disk (never renamed)
    val createdAt: Long = 0L // timestamp from metadata
)

// Sort mode enum
enum class DocumentSortMode {
    BY_DATE,  // Newest first
    BY_TITLE  // Alphabetical
}

// Helper functions for document management
fun SupplierDocument.isImage(): Boolean {
    val ext = file.extension.lowercase()
    return ext in listOf("jpg", "jpeg", "png", "webp", "gif", "bmp")
}

fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}

fun formatDate(timestamp: Long): String {
    if (timestamp == 0L) return ""
    return try {
        val sdf = SimpleDateFormat("dd.MM.yyyy", Locale.getDefault())
        sdf.format(java.util.Date(timestamp))
    } catch (e: Exception) {
        ""
    }
}

fun getMimeType(file: File): String {
    val ext = file.extension.lowercase()
    return when (ext) {
        "pdf" -> "application/pdf"
        "doc", "docx" -> "application/msword"
        "xls", "xlsx" -> "application/vnd.ms-excel"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        else -> "*/*"
    }
}

// Helper function to get file type icon based on extension
@Composable
private fun getFileTypeIcon(file: File): androidx.compose.ui.graphics.vector.ImageVector {
    val ext = file.extension.lowercase()
    return when (ext) {
        "pdf" -> Icons.Filled.PictureAsPdf
        "doc", "docx" -> Icons.Filled.Description
        "xls", "xlsx" -> Icons.Filled.TableChart
        "jpg", "jpeg", "png", "gif", "webp", "bmp" -> Icons.Filled.Image
        "txt" -> Icons.Filled.TextSnippet
        "zip", "rar", "7z" -> Icons.Filled.Archive
        else -> Icons.Filled.InsertDriveFile
    }
}

// Clean card-based document item composable - no per-card actions, supports selection
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DocumentCard(
    document: SupplierDocument,
    isSelected: Boolean = false,
    onPreview: (SupplierDocument) -> Unit,
    onLongPress: (SupplierDocument) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .clickable { onLongPress(document) }
            .then(
                if (isSelected) {
                    Modifier.border(
                        width = 3.dp,
                        color = MaterialTheme.colorScheme.primary,
                        shape = RoundedCornerShape(12.dp)
                    )
                } else Modifier
            ),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) 
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            else 
                MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header with file icon and name
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // File type icon (OS-style)
                Icon(
                    imageVector = getFileTypeIcon(document.file),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                // File name
                Text(
                    text = document.title,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
                // Selection indicator
                if (isSelected) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
            
            // Preview area - takes all remaining height
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                        RoundedCornerShape(8.dp)
                    )
                    .padding(8.dp),
                contentAlignment = Alignment.Center
            ) {
                if (document.isImage()) {
                    // Image preview
                    val bitmap = remember(document.file.path) {
                        try {
                            val options = BitmapFactory.Options().apply {
                                inJustDecodeBounds = true
                            }
                            BitmapFactory.decodeFile(document.file.path, options)
                            
                            val maxSize = 400
                            val scale = if (options.outWidth > options.outHeight) {
                                options.outWidth / maxSize
                            } else {
                                options.outHeight / maxSize
                            }
                            options.inSampleSize = scale.coerceAtLeast(1)
                            options.inJustDecodeBounds = false
                            
                            BitmapFactory.decodeFile(document.file.path, options)
                        } catch (e: Exception) {
                            Log.e("SupplierDocs", "Error loading preview", e)
                            null
                        }
                    }
                    
                    val bitmapNonNull = bitmap
                    if (bitmapNonNull != null) {
                        Image(
                            bitmap = bitmapNonNull.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Fit
                        )
                    } else {
                        // Fallback icon
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Image,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "לא ניתן לטעון תמונה",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                } else {
                    // Non-image file - show large icon
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = getFileTypeIcon(document.file),
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "לחץ לתצוגה מקדימה",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

// Full-screen document preview screen
@Composable
fun DocumentPreviewScreen(
    navController: NavHostController,
    supplierId: Long,
    documentPath: String
) {
    val context = LocalContext.current
    val metadataStore = remember { SupplierDocumentsMetadataStore(context) }
    
    // Decode the document path
    val decodedPath = Uri.decode(documentPath)
    val documentFile = File(decodedPath)
    
    // Load document metadata
    var document by remember { mutableStateOf<SupplierDocument?>(null) }
    var renameTarget by remember { mutableStateOf<SupplierDocument?>(null) }
    var renameText by remember { mutableStateOf("") }
    var renameField by remember { mutableStateOf(TextFieldValue("")) }
    
    LaunchedEffect(documentPath) {
        try {
            val supplierIdStr = supplierId.toString()
            val metadataList = metadataStore.getDocumentsForSupplier(supplierIdStr)
            val metadata = metadataList.firstOrNull { it.filePath == decodedPath }
            
            if (documentFile.exists() && documentFile.isFile) {
                val fileUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    documentFile
                )
                document = SupplierDocument(
                    title = metadata?.title ?: documentFile.name,
                    uri = fileUri,
                    file = documentFile,
                    createdAt = metadata?.createdAt ?: documentFile.lastModified().takeIf { it > 0 } ?: System.currentTimeMillis()
                )
            }
        } catch (e: Exception) {
            Log.e("DocumentPreview", "Error loading document", e)
            Toast.makeText(context, "שגיאה בטעינת המסמך", Toast.LENGTH_SHORT).show()
        }
    }
    
    if (document == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center
        ) {
            Text("מסמך לא נמצא")
        }
        return
    }
    
    val doc = document!!
    
    // Full-screen layout
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top app bar
            TitleBar(
                title = "תצוגה מקדימה",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            
            // Content area - full remaining height
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Spacer(Modifier.height(16.dp))
                
                // Preview area - full width, large height
                if (doc.isImage()) {
                    val bitmap = remember(doc.file.path) {
                        try {
                            BitmapFactory.decodeFile(doc.file.path)
                        } catch (e: Exception) {
                            Log.e("DocumentPreview", "Error loading preview image", e)
                            null
                        }
                    }
                    
                    val bitmapNonNull = bitmap
                    if (bitmapNonNull != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(400.dp)
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(12.dp)
                                )
                                .padding(8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Image(
                                bitmap = bitmapNonNull.asImageBitmap(),
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Fit
                            )
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(300.dp)
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(12.dp)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Image,
                                    contentDescription = null,
                                    modifier = Modifier.size(48.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = "לא ניתן לטעון תמונה",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(12.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = getFileTypeIcon(doc.file),
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "תצוגה מקדימה אינה זמינה לקובץ זה",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "ניתן לפתוח את הקובץ באפליקציה חיצונית",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                
                Spacer(Modifier.height(24.dp))
                
                // Action buttons - Button style
                Button(
                    onClick = {
                        try {
                            val contentUri = FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.fileprovider",
                                doc.file
                            )
                            val intent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(contentUri, getMimeType(doc.file))
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            Log.e("DocumentPreview", "Error opening document externally", e)
                            Toast.makeText(
                                context,
                                "שגיאה בפתיחת הקובץ: ${e.message}",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "📂",
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "פתח באפליקציה חיצונית",
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
                
                Spacer(Modifier.height(8.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Share button
                    FloatingActionButton(
                        onClick = {
                            try {
                                val contentUri = FileProvider.getUriForFile(
                                    context,
                                    "${context.packageName}.fileprovider",
                                    doc.file
                                )
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = getMimeType(doc.file)
                                    putExtra(Intent.EXTRA_STREAM, contentUri)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(intent, "שתף מסמך"))
                            } catch (e: Exception) {
                                Log.e("DocumentPreview", "Error sharing document", e)
                                Toast.makeText(
                                    context,
                                    "שגיאה בשיתוף: ${e.message}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                        modifier = Modifier.weight(1f),
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp)
                        ) {
                            Text(
                                text = "📤",
                                fontSize = 18.sp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "שיתוף",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                    // Rename button
                    FloatingActionButton(
                        onClick = {
                            renameTarget = doc
                            renameText = doc.title
                            renameField = TextFieldValue(
                                text = doc.title,
                                selection = TextRange(0, doc.title.length)
                            )
                        },
                        modifier = Modifier.weight(1f),
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp)
                        ) {
                            Text(
                                text = "✏️",
                                fontSize = 18.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "שינוי שם",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    // Delete button
                    FloatingActionButton(
                        onClick = {
                            try {
                                if (doc.file.exists() && doc.file.isFile) {
                                    val filePath = doc.file.absolutePath
                                    if (doc.file.delete()) {
                                        metadataStore.removeDocument(supplierId.toString(), filePath)
                                        Toast.makeText(context, "הקובץ נמחק בהצלחה", Toast.LENGTH_SHORT).show()
                                        navController.popBackStack()
                                    } else {
                                        Toast.makeText(context, "שגיאה במחיקת הקובץ", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e("DocumentPreview", "Error deleting file", e)
                                Toast.makeText(context, "שגיאה במחיקת הקובץ: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.weight(1f),
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp)
                        ) {
                            Text(
                                text = "🗑",
                                fontSize = 18.sp,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "מחק",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }
                }
                
                Spacer(Modifier.height(16.dp))
            }
        }
    }
    
    // Rename dialog
    if (renameTarget != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { 
                renameTarget = null
                renameText = ""
            },
            title = { Text("שינוי שם מסמך") },
            text = {
                Column {
                    OutlinedTextField(
                        value = renameText,
                        onValueChange = { renameText = it },
                        label = { Text("שם קובץ") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val target = renameTarget ?: return@Button
                        val trimmedTitle = renameText.trim()
                        
                        if (trimmedTitle.isEmpty()) {
                            Toast.makeText(context, "שם הקובץ לא יכול להיות ריק", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        
                        try {
                            val filePath = target.file.absolutePath
                            val supplierIdStr = supplierId.toString()
                            
                            val existingDocs = metadataStore.getDocumentsForSupplier(supplierIdStr)
                            val hasDuplicate = existingDocs.any { 
                                it.filePath != filePath && it.title == trimmedTitle 
                            }
                            
                            if (hasDuplicate) {
                                Toast.makeText(context, "קובץ עם שם זה כבר קיים", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            
                            metadataStore.renameDocumentTitle(supplierIdStr, filePath, trimmedTitle)
                            
                            Log.d("DocumentPreview", "Renamed metadata title for file '$filePath' to '$trimmedTitle'")
                            Toast.makeText(context, "השם שונה בהצלחה", Toast.LENGTH_SHORT).show()
                            
                            // Update document state
                            document = document?.copy(title = trimmedTitle)
                            renameTarget = null
                            renameText = ""
                        } catch (e: Exception) {
                            Log.e("DocumentPreview", "Failed to rename metadata title", e)
                            Toast.makeText(context, "שגיאה בשינוי שם המסמך", Toast.LENGTH_SHORT).show()
                        }
                    }
                ) {
                    Text("אישור")
                }
            },
            dismissButton = {
                Button(onClick = { 
                    renameTarget = null
                    renameText = ""
                }) { 
                    Text("ביטול") 
                }
            }
        )
    }
}

// Legacy preview bottom sheet composable (kept for backward compatibility)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DocumentPreviewSheet(
    document: SupplierDocument?,
    onDismiss: () -> Unit,
    onOpenExternal: (SupplierDocument) -> Unit,
    onShare: (SupplierDocument) -> Unit,
    onDelete: (SupplierDocument) -> Unit,
    onRename: (SupplierDocument) -> Unit,
    context: android.content.Context
) {
    if (document == null) return
    
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = document.title,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Filled.Close, contentDescription = "סגור")
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Preview area
            if (document.isImage()) {
                // Image preview
                val bitmap = remember(document.file.path) {
                    try {
                        BitmapFactory.decodeFile(document.file.path)
                    } catch (e: Exception) {
                        Log.e("SupplierDocs", "Error loading preview image", e)
                        null
                    }
                }
                
                val bitmapNonNull = bitmap
                if (bitmapNonNull != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(12.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            bitmap = bitmapNonNull.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Fit
                        )
                    }
                } else {
                    // Fallback for image load failure
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(12.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Image,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "לא ניתן לטעון תמונה",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            } else {
                // Generic preview for non-image files
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(12.dp)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Description,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "תצוגה מקדימה אינה זמינה לקובץ זה",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "ניתן לפתוח את הקובץ באפליקציה חיצונית",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(24.dp))
            
            // Metadata section
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    MetadataRow("שם קובץ מקורי:", document.file.name)
                    MetadataRow("גודל:", formatFileSize(document.file.length()))
                    if (document.createdAt > 0) {
                        MetadataRow("תאריך יצירה:", formatDate(document.createdAt))
                    }
                }
            }
            
            Spacer(Modifier.height(24.dp))
            
            // Action buttons - FloatingActionButton style to match main screen
            FloatingActionButton(
                onClick = { onOpenExternal(document) },
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Filled.Launch,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "פתח באפליקציה חיצונית",
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
            
            Spacer(Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Share button
                FloatingActionButton(
                    onClick = { onShare(document) },
                    modifier = Modifier.weight(1f),
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Filled.Share,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "שיתוף",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
                // Rename button
                FloatingActionButton(
                    onClick = { onRename(document) },
                    modifier = Modifier.weight(1f),
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Filled.Create,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "שינוי שם",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                // Delete button
                FloatingActionButton(
                    onClick = { onDelete(document) },
                    modifier = Modifier.weight(1f),
                    containerColor = MaterialTheme.colorScheme.errorContainer
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "מחק",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun MetadataRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr)
        )
    }
}

@Composable
private fun OutlinedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    colors: androidx.compose.material3.ButtonColors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(),
    content: @Composable RowScope.() -> Unit
) {
    androidx.compose.material3.OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        colors = colors,
        content = content
    )
}

// Full-screen supplier documents list screen
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SupplierDocumentsScreen(
    navController: NavHostController,
    supplierId: Long
) {
    val context = LocalContext.current
    
    // Use app-private external storage for supplier documents
    val baseDir = context.getExternalFilesDir("supplier_docs") 
        ?: File(context.filesDir, "supplier_docs")
    val supplierDir = File(baseDir, supplierId.toString())
    if (!supplierDir.exists()) {
        supplierDir.mkdirs()
    }

    // Metadata store for document titles
    val metadataStore = remember { SupplierDocumentsMetadataStore(context) }

    var files by remember(supplierId) { mutableStateOf<List<SupplierDocument>>(emptyList()) }
    var confirmDeleteUris by remember { mutableStateOf<Set<Uri>?>(null) }
    var renameTarget by remember { mutableStateOf<SupplierDocument?>(null) }
    var renameText by remember { mutableStateOf("") }
    var renameField by remember { mutableStateOf(TextFieldValue("")) }
    var sortMode by remember { mutableStateOf(DocumentSortMode.BY_DATE) }
    
    // Search state
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    
    // Multi-selection state: selected document file paths
    var selectedDocumentPaths by remember { mutableStateOf<Set<String>>(emptySet()) }
    
    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Sort documents based on current sort mode
    val sortedFiles = remember(files, sortMode) {
        when (sortMode) {
            DocumentSortMode.BY_DATE -> files.sortedByDescending { it.createdAt }
            DocumentSortMode.BY_TITLE -> files.sortedBy { it.title.lowercase() }
        }
    }
    
    // Filter by search query
    val filteredFiles = remember(sortedFiles, debouncedQuery) {
        if (debouncedQuery.trim().isEmpty()) {
            sortedFiles
        } else {
            val query = debouncedQuery.trim().lowercase()
            sortedFiles.filter { doc ->
                doc.title.lowercase().contains(query)
            }
        }
    }

    // Refresh files list from metadata + file system sync
    val refreshFiles: () -> Unit = {
        val list = mutableListOf<SupplierDocument>()
        try {
            val filesOnDisk = mutableListOf<File>()
            if (supplierDir.exists() && supplierDir.isDirectory) {
                supplierDir.listFiles()?.forEach { file ->
                    if (file.isFile) {
                        filesOnDisk.add(file)
                    }
                }
            }
            
            val supplierIdStr = supplierId.toString()
            val metadataList = metadataStore.syncWithFileSystem(supplierIdStr, filesOnDisk)
            
            metadataList.forEach { metadata ->
                val file = File(metadata.filePath)
                if (file.exists() && file.isFile) {
                    val fileUri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                    list.add(SupplierDocument(
                        title = metadata.title,
                        uri = fileUri,
                        file = file,
                        createdAt = metadata.createdAt
                    ))
                }
            }
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error reading files from supplier directory", e)
            try {
                if (supplierDir.exists() && supplierDir.isDirectory) {
                    supplierDir.listFiles()?.forEach { file ->
                        if (file.isFile) {
                            val fileUri = FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.fileprovider",
                                file
                            )
                            list.add(SupplierDocument(
                                title = file.name,
                                uri = fileUri,
                                file = file,
                                createdAt = file.lastModified().takeIf { it > 0 } ?: System.currentTimeMillis()
                            ))
                        }
                    }
                }
            } catch (fallbackError: Exception) {
                Log.e("SupplierDocs", "Fallback file reading also failed", fallbackError)
            }
            Toast.makeText(context, "שגיאה בקריאת קבצים: ${e.message}", Toast.LENGTH_SHORT).show()
        }
        files = list
    }

    LaunchedEffect(supplierId) {
        refreshFiles()
    }

    // Copy file from SAF URI to app-private storage
    val copyFileToSupplierDir: (Uri) -> Unit = { sourceUri ->
        try {
            val cr = context.contentResolver
            
            try {
                context.contentResolver.takePersistableUriPermission(
                    sourceUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (e: SecurityException) {
                Log.d("SupplierDocs", "URI is not persistable, proceeding with copy")
            }

            val fileName = cr.query(sourceUri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    cursor.getString(nameIndex)
                } else null
            } ?: sourceUri.lastPathSegment ?: "doc_${System.currentTimeMillis()}.bin"

            if (!supplierDir.exists()) {
                if (!supplierDir.mkdirs()) {
                    throw Exception("Failed to create supplier directory")
                }
            }

            val targetFile = File(supplierDir, fileName)
            cr.openInputStream(sourceUri)?.use { inputStream ->
                targetFile.outputStream().use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            } ?: throw Exception("Failed to open input stream from source URI")

            Log.d("SupplierDocs", "Successfully copied file to: ${targetFile.absolutePath}")
            
            val metadata = com.rentacar.app.data.SupplierDocumentMetadata(
                supplierId = supplierId.toString(),
                filePath = targetFile.absolutePath,
                title = targetFile.name,
                createdAt = System.currentTimeMillis()
            )
            metadataStore.upsertDocument(metadata)
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error copying file from URI: $sourceUri", e)
            throw e
        }
    }

    val copyFilesToSupplierDir: (List<Uri>) -> Unit = { uris ->
        var successCount = 0
        var errorCount = 0
        
        uris.forEach { uri ->
            try {
                try {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (e: SecurityException) {
                    Log.e("SupplierDocs", "Failed to persist URI permission for $uri", e)
                }
                
                copyFileToSupplierDir(uri)
                successCount++
            } catch (e: Exception) {
                errorCount++
                Log.e("SupplierDocs", "Error copying file from URI: $uri", e)
            }
        }
        
        when {
            successCount > 0 && errorCount == 0 ->
                Toast.makeText(context, "$successCount קבצים הועתקו בהצלחה", Toast.LENGTH_SHORT).show()
            successCount > 0 && errorCount > 0 ->
                Toast.makeText(context, "$successCount קבצים הועתקו, $errorCount שגיאות", Toast.LENGTH_LONG).show()
            else ->
                Toast.makeText(context, "שגיאה בהעתקת הקבצים", Toast.LENGTH_LONG).show()
        }
        
        refreshFiles()
    }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            copyFilesToSupplierDir(uris)
        }
    }

    // Full-screen layout
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Top app bar
            TitleBar(
                title = "מסמכי ספק",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            
            // Content area - full remaining height
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                // Search bar at top
                AppSearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    placeholder = "חיפוש מסמך לפי שם..."
                )
                
                Spacer(Modifier.height(12.dp))
                
                // Documents grid or empty state
                if (filteredFiles.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        AppEmptySearchState(
                            message = if (debouncedQuery.isNotEmpty()) {
                                "לא נמצאו תוצאות תואמות לחיפוש שלך."
                            } else {
                                "אין מסמכים לספק זה."
                            }
                        )
                    }
                } else {
                    // Documents grid - 2 cards per row, full remaining height
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filteredFiles, key = { it.file.absolutePath }) { document ->
                            val isSelected = selectedDocumentPaths.contains(document.file.absolutePath)
                            DocumentCard(
                                document = document,
                                isSelected = isSelected,
                                onPreview = { }, // Still unused; selection is via click
                                onLongPress = { doc ->
                                    val path = doc.file.absolutePath
                                    selectedDocumentPaths = if (selectedDocumentPaths.contains(path)) {
                                        selectedDocumentPaths - path
                                    } else {
                                        selectedDocumentPaths + path
                                    }
                                }
                            )
                        }
                    }
                }
            }
            
        }
        
        // Bottom action bar - 5 buttons: Add, View, Edit, Share, Delete (outside Column, in Box)
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
                val selectedDocuments = files.filter { doc ->
                    selectedDocumentPaths.contains(doc.file.absolutePath)
                }
                val hasSelection = selectedDocuments.isNotEmpty()
                val hasSingleSelection = selectedDocuments.size == 1
                val singleSelectedDocument = selectedDocuments.firstOrNull()
                
                // 1. Add button - always enabled
                FloatingActionButton(
                    onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                    ) {
                        Text(
                            text = "➕",
                            fontSize = 18.sp
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "הוסף",
                            fontSize = 10.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                
                // 2. View button - enabled only when exactly one document is selected
                FloatingActionButton(
                    onClick = {
                        if (!hasSelection) {
                            Toast.makeText(context, "אנא בחר מסמך לתצוגה", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        if (!hasSingleSelection) {
                            Toast.makeText(context, "ניתן להציג מסמך אחד בלבד", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        val doc = singleSelectedDocument ?: return@FloatingActionButton
                        val encodedPath = Uri.encode(doc.file.absolutePath)
                        navController.navigate("documentPreview/${supplierId}/$encodedPath")
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (hasSingleSelection) 1f else 0.3f)
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                    ) {
                        Text(
                            text = "👁️",
                            fontSize = 18.sp
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "תצוגה",
                            fontSize = 10.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                
                // 3. Edit (Rename) button - enabled only when exactly one document is selected
                FloatingActionButton(
                    onClick = {
                        if (!hasSelection) {
                            Toast.makeText(context, "אנא בחר מסמך לעריכה", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        if (!hasSingleSelection) {
                            Toast.makeText(context, "ניתן לערוך מסמך אחד בלבד", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        val doc = singleSelectedDocument ?: return@FloatingActionButton
                        renameTarget = doc
                        renameText = doc.title
                        renameField = TextFieldValue(
                            text = doc.title,
                            selection = TextRange(0, doc.title.length)
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (hasSingleSelection) 1f else 0.3f),
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                    ) {
                        Text(
                            text = "✏️",
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "עריכה",
                            fontSize = 10.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                // 4. Share button - enabled when one or more documents are selected
                FloatingActionButton(
                    onClick = {
                        if (!hasSelection) {
                            Toast.makeText(context, "אנא בחר מסמך לשיתוף", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }

                        try {
                            if (hasSingleSelection) {
                                val doc = singleSelectedDocument ?: return@FloatingActionButton
                                val contentUri = FileProvider.getUriForFile(
                                    context,
                                    "${context.packageName}.fileprovider",
                                    doc.file
                                )
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = getMimeType(doc.file)
                                    putExtra(Intent.EXTRA_STREAM, contentUri)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(intent, "שתף מסמך"))
                            } else {
                                // Multiple selection - share all
                                val uris = selectedDocuments.map { doc ->
                                    FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.fileprovider",
                                        doc.file
                                    )
                                }
                                val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                                    type = "*/*" // safe generic MIME type for mixed files
                                    putParcelableArrayListExtra(
                                        Intent.EXTRA_STREAM,
                                        ArrayList(uris)
                                    )
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(intent, "שתף מסמכים"))
                            }
                        } catch (e: Exception) {
                            Log.e("SupplierDocs", "Error sharing document(s)", e)
                            Toast.makeText(
                                context,
                                "שגיאה בשיתוף: ${e.message}",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (hasSelection) 1f else 0.3f)
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                    ) {
                        Text(
                            text = "📤",
                            fontSize = 18.sp
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "שיתוף",
                            fontSize = 10.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                
                // 5. Delete button - enabled when one or more documents are selected
                FloatingActionButton(
                    onClick = {
                        if (!hasSelection) {
                            Toast.makeText(context, "אנא בחר מסמך למחיקה", Toast.LENGTH_SHORT).show()
                            return@FloatingActionButton
                        }
                        confirmDeleteUris = selectedDocuments.map { it.uri }.toSet()
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(64.dp)
                        .alpha(if (hasSelection) 1f else 0.3f),
                    containerColor = MaterialTheme.colorScheme.errorContainer
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                    ) {
                        Text(
                            text = "🗑",
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "מחק",
                            fontSize = 10.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }
        }
    
    // Delete confirmation dialog
    if (confirmDeleteUris != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDeleteUris = null },
            title = { Text("אישור מחיקה") },
            text = { Text("האם למחוק ${confirmDeleteUris!!.size} מסמכים?") },
            confirmButton = {
                Button(onClick = {
                    confirmDeleteUris?.let { uris ->
                        var deletedCount = 0
                        var errorCount = 0
                        val deletedPaths = mutableSetOf<String>()
                        uris.forEach { uri ->
                            try {
                                val document = files.firstOrNull { it.uri == uri }
                                if (document != null && document.file.exists() && document.file.isFile) {
                                    val filePath = document.file.absolutePath
                                    if (document.file.delete()) {
                                        metadataStore.removeDocument(supplierId.toString(), filePath)
                                        deletedCount++
                                        deletedPaths.add(filePath)
                                        Log.d("SupplierDocs", "Deleted file: $filePath")
                                    } else {
                                        errorCount++
                                        Log.w("SupplierDocs", "Failed to delete file: $filePath")
                                    }
                                } else {
                                    errorCount++
                                    Log.w("SupplierDocs", "File does not exist for URI: $uri")
                                }
                            } catch (e: Exception) {
                                errorCount++
                                Log.e("SupplierDocs", "Error deleting file: $uri", e)
                            }
                        }
                        when {
                            deletedCount > 0 && errorCount == 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו בהצלחה",
                                    Toast.LENGTH_SHORT
                                ).show()

                            deletedCount > 0 && errorCount > 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו, $errorCount שגיאות",
                                    Toast.LENGTH_LONG
                                ).show()

                            else ->
                                Toast.makeText(
                                    context,
                                    "שגיאה במחיקת הקבצים",
                                    Toast.LENGTH_SHORT
                                ).show()
                        }
                        // Clear selection for any deleted documents
                        if (deletedPaths.isNotEmpty()) {
                            selectedDocumentPaths = selectedDocumentPaths - deletedPaths
                        }
                        refreshFiles()
                        confirmDeleteUris = null
                    }
                }) { Text("מחק") }
            },
            dismissButton = {
                Button(onClick = { confirmDeleteUris = null }) { Text("ביטול") }
            }
        )
    }

    // Rename dialog
    if (renameTarget != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { 
                renameTarget = null
                renameText = ""
                renameField = TextFieldValue("")
            },
            title = { Text("שינוי שם מסמך") },
            text = {
                Column {
                    OutlinedTextField(
                        value = renameField,
                        onValueChange = { newValue ->
                            renameField = newValue
                            renameText = newValue.text
                        },
                        label = { Text("שם קובץ") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val target = renameTarget ?: return@Button
                        val trimmedTitle = renameText.trim()
                        
                        if (trimmedTitle.isEmpty()) {
                            Toast.makeText(context, "שם הקובץ לא יכול להיות ריק", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        
                        try {
                            val filePath = target.file.absolutePath
                            val supplierIdStr = supplierId.toString()
                            
                            val existingDocs = metadataStore.getDocumentsForSupplier(supplierIdStr)
                            val hasDuplicate = existingDocs.any { 
                                it.filePath != filePath && it.title == trimmedTitle 
                            }
                            
                            if (hasDuplicate) {
                                Toast.makeText(context, "קובץ עם שם זה כבר קיים", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            
                            metadataStore.renameDocumentTitle(supplierIdStr, filePath, trimmedTitle)
                            
                            Log.d("SupplierDocs", "Renamed metadata title for file '$filePath' to '$trimmedTitle'")
                            Toast.makeText(context, "השם שונה בהצלחה", Toast.LENGTH_SHORT).show()
                            refreshFiles()
                        } catch (e: Exception) {
                            Log.e("SupplierDocs", "Failed to rename metadata title for '${target.title}'", e)
                            Toast.makeText(context, "שגיאה בשינוי שם המסמך", Toast.LENGTH_SHORT).show()
                        }
                        
                        renameTarget = null
                        renameText = ""
                        renameField = TextFieldValue("")
                    }
                ) {
                    Text("אישור")
                }
            },
            dismissButton = {
                Button(onClick = { 
                    renameTarget = null
                    renameText = ""
                    renameField = TextFieldValue("")
                }) { 
                    Text("ביטול") 
                }
            }
        )
    }
}

// Legacy dialog version (kept for backward compatibility, but will be replaced)
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SupplierDocsManageDialog(
    context: android.content.Context,
    supplierId: Long?,
    onDismiss: () -> Unit
) {
    if (supplierId == null) return

    // Use app-private external storage for supplier documents
    // This feature uses SAF (Storage Access Framework) and does not rely on /storage/emulated/0/...
    val baseDir = context.getExternalFilesDir("supplier_docs") 
        ?: File(context.filesDir, "supplier_docs")
    val supplierDir = File(baseDir, supplierId.toString())
    if (!supplierDir.exists()) {
        supplierDir.mkdirs()
    }

    // Metadata store for document titles
    // Physical files are never renamed - only metadata titles can be changed
    val metadataStore = remember { SupplierDocumentsMetadataStore(context) }

    var files by remember(supplierId) { mutableStateOf<List<SupplierDocument>>(emptyList()) }
    var selectedUris by remember { mutableStateOf<Set<Uri>>(emptySet()) }
    var confirmDeleteUris by remember { mutableStateOf<Set<Uri>?>(null) }
    var renameTarget by remember { mutableStateOf<SupplierDocument?>(null) }
    var renameText by remember { mutableStateOf("") }
    var previewTarget by remember { mutableStateOf<SupplierDocument?>(null) }
    var sortMode by remember { mutableStateOf(DocumentSortMode.BY_DATE) }
    
    // Sort documents based on current sort mode
    val sortedFiles = remember(files, sortMode) {
        when (sortMode) {
            DocumentSortMode.BY_DATE -> files.sortedByDescending { it.createdAt }
            DocumentSortMode.BY_TITLE -> files.sortedBy { it.title.lowercase() }
        }
    }

    // Refresh files list from metadata + file system sync
    // This ensures metadata exists for all files and displays titles from metadata
    val refreshFiles: () -> Unit = {
        val list = mutableListOf<SupplierDocument>()
        try {
            // Get all files from disk
            val filesOnDisk = mutableListOf<File>()
            if (supplierDir.exists() && supplierDir.isDirectory) {
                supplierDir.listFiles()?.forEach { file ->
                    if (file.isFile) {
                        filesOnDisk.add(file)
                    }
                }
            }
            
            // Sync metadata with files on disk (creates metadata for missing files)
            val supplierIdStr = supplierId.toString()
            val metadataList = metadataStore.syncWithFileSystem(supplierIdStr, filesOnDisk)
            
            // Build document list from metadata
            metadataList.forEach { metadata ->
                val file = File(metadata.filePath)
                if (file.exists() && file.isFile) {
                    // Use FileProvider URI for sharing
                    val fileUri = FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                    list.add(SupplierDocument(
                        title = metadata.title,
                        uri = fileUri,
                        file = file,
                        createdAt = metadata.createdAt
                    ))
                }
            }
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error reading files from supplier directory", e)
            // Fallback: show basic list from files if metadata fails
            try {
                if (supplierDir.exists() && supplierDir.isDirectory) {
                    supplierDir.listFiles()?.forEach { file ->
                        if (file.isFile) {
                            val fileUri = FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.fileprovider",
                                file
                            )
                            list.add(SupplierDocument(
                                title = file.name,  // Fallback to file name
                                uri = fileUri,
                                file = file,
                                createdAt = file.lastModified().takeIf { it > 0 } ?: System.currentTimeMillis()
                            ))
                        }
                    }
                }
            } catch (fallbackError: Exception) {
                Log.e("SupplierDocs", "Fallback file reading also failed", fallbackError)
            }
            Toast.makeText(context, "שגיאה בקריאת קבצים: ${e.message}", Toast.LENGTH_SHORT).show()
        }
        files = list
    }

    // עדיף להריץ Side-effect כשה־supplierId משתנה
    LaunchedEffect(supplierId) {
        refreshFiles()
    }

    // Copy file from SAF URI to app-private storage
    // This feature uses SAF and does not rely on /storage/emulated/0/... paths
    val copyFileToSupplierDir: (Uri) -> Unit = { sourceUri ->
        try {
            val cr = context.contentResolver
            
            // Try to persist URI permission for ACTION_OPEN_DOCUMENT URIs
            try {
                context.contentResolver.takePersistableUriPermission(
                    sourceUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (e: SecurityException) {
                // Not a persistable URI, that's okay - we'll copy it immediately
                Log.d("SupplierDocs", "URI is not persistable, proceeding with copy")
            }

            // Get file name from URI
            val fileName = cr.query(sourceUri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    cursor.getString(nameIndex)
                } else null
            } ?: sourceUri.lastPathSegment ?: "doc_${System.currentTimeMillis()}.bin"

            // Ensure supplier directory exists
            if (!supplierDir.exists()) {
                if (!supplierDir.mkdirs()) {
                    throw Exception("Failed to create supplier directory")
                }
            }

            // Copy file to app-private storage
            val targetFile = File(supplierDir, fileName)
            cr.openInputStream(sourceUri)?.use { inputStream ->
                targetFile.outputStream().use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            } ?: throw Exception("Failed to open input stream from source URI")

            Log.d("SupplierDocs", "Successfully copied file to: ${targetFile.absolutePath}")
            
            // Create metadata entry for the new file
            // Title is initially set to the file name
            val metadata = com.rentacar.app.data.SupplierDocumentMetadata(
                supplierId = supplierId.toString(),
                filePath = targetFile.absolutePath,
                title = targetFile.name,  // Initial title is the file name
                createdAt = System.currentTimeMillis()
            )
            metadataStore.upsertDocument(metadata)
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error copying file from URI: $sourceUri", e)
            throw e // Re-throw to be handled by caller
        }
    }

    // Copy multiple files from SAF URIs to app-private storage
    // Multi-document import handler
    val copyFilesToSupplierDir: (List<Uri>) -> Unit = { uris ->
        var successCount = 0
        var errorCount = 0
        
        uris.forEach { uri ->
            try {
                // Apply persistable permissions for each URI
                try {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (e: SecurityException) {
                    Log.e("SupplierDocs", "Failed to persist URI permission for $uri", e)
                }
                
                copyFileToSupplierDir(uri)
                successCount++
            } catch (e: Exception) {
                errorCount++
                Log.e("SupplierDocs", "Error copying file from URI: $uri", e)
            }
        }
        
        // Show summary toast
        when {
            successCount > 0 && errorCount == 0 ->
                Toast.makeText(context, "$successCount קבצים הועתקו בהצלחה", Toast.LENGTH_SHORT).show()
            successCount > 0 && errorCount > 0 ->
                Toast.makeText(context, "$successCount קבצים הועתקו, $errorCount שגיאות", Toast.LENGTH_LONG).show()
            else ->
                Toast.makeText(context, "שגיאה בהעתקת הקבצים", Toast.LENGTH_LONG).show()
        }
        
        refreshFiles()
    }

    // Multi-document SAF picker using ACTION_OPEN_DOCUMENT
    // This feature uses SAF and does not rely on /storage/emulated/0/... paths
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            copyFilesToSupplierDir(uris)
        }
    }

    // Card-based UX for supplier documents
    // Modern card layout with preview support for images and generic preview for other files
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("מסמכי ספק")
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Text(
                        text = "${sortedFiles.size} מסמכים",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(520.dp)
            ) {
                // Sort controls
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = sortMode == DocumentSortMode.BY_DATE,
                        onClick = { sortMode = DocumentSortMode.BY_DATE },
                        label = { Text("תאריך") }
                    )
                    FilterChip(
                        selected = sortMode == DocumentSortMode.BY_TITLE,
                        onClick = { sortMode = DocumentSortMode.BY_TITLE },
                        label = { Text("שם") }
                    )
                }
                
                Spacer(Modifier.height(12.dp))
                
                // Import button - FloatingActionButton style
                FloatingActionButton(
                    onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                    modifier = Modifier.fillMaxWidth(),
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Row(
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "הוסף מסמכים",
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
                
                Spacer(Modifier.height(16.dp))
                
                // Documents list or empty state
                if (sortedFiles.isEmpty()) {
                    // Empty state card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Description,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "אין מסמכים לספק זה",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = "הוסף מסמכים באמצעות הכפתור למעלה",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                } else {
                    // Documents grid - 2 cards per row
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(sortedFiles, key = { it.file.absolutePath }) { document ->
                            DocumentCard(
                                document = document,
                                isSelected = false, // Dialog doesn't use selection
                                onPreview = { }, // Not used
                                onLongPress = { doc ->
                                    // In dialog, long press opens preview
                                    previewTarget = doc
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("סגור")
            }
        }
    )
    
    // Preview bottom sheet
    // Preview supports inline image preview; non-image files fall back to a generic preview with open/share/delete
    DocumentPreviewSheet(
        document = previewTarget,
        onDismiss = { previewTarget = null },
        onOpenExternal = { doc ->
            try {
                val contentUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    doc.file
                )
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, getMimeType(doc.file))
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e("SupplierDocs", "Error opening document externally", e)
                Toast.makeText(
                    context,
                    "שגיאה בפתיחת הקובץ: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        },
        onShare = { doc ->
            try {
                val contentUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    doc.file
                )
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = getMimeType(doc.file)
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(intent, "שתף מסמך"))
            } catch (e: Exception) {
                Log.e("SupplierDocs", "Error sharing document", e)
                Toast.makeText(
                    context,
                    "שגיאה בשיתוף: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        },
        onDelete = { doc ->
            previewTarget = null
            confirmDeleteUris = setOf(doc.uri)
        },
        onRename = { doc ->
            previewTarget = null
            renameTarget = doc
            renameText = doc.title
        },
        context = context
    )

    if (confirmDeleteUris != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDeleteUris = null },
            title = { Text("אישור מחיקה") },
            text = { Text("האם למחוק ${confirmDeleteUris!!.size} מסמכים?") },
            confirmButton = {
                Button(onClick = {
                    confirmDeleteUris?.let { uris ->
                        var deletedCount = 0
                        var errorCount = 0
                        uris.forEach { uri ->
                            try {
                                // Find the document in our list to get the current file
                                val document = files.firstOrNull { it.uri == uri }
                                if (document != null && document.file.exists() && document.file.isFile) {
                                    val filePath = document.file.absolutePath
                                    // Delete physical file
                                    if (document.file.delete()) {
                                        // Remove metadata entry
                                        metadataStore.removeDocument(supplierId.toString(), filePath)
                                        deletedCount++
                                        Log.d("SupplierDocs", "Deleted file: $filePath")
                                    } else {
                                        errorCount++
                                        Log.w("SupplierDocs", "Failed to delete file: $filePath")
                                    }
                                } else {
                                    errorCount++
                                    Log.w("SupplierDocs", "File does not exist for URI: $uri")
                                }
                            } catch (e: Exception) {
                                errorCount++
                                Log.e("SupplierDocs", "Error deleting file: $uri", e)
                            }
                        }
                        when {
                            deletedCount > 0 && errorCount == 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו בהצלחה",
                                    Toast.LENGTH_SHORT
                                ).show()

                            deletedCount > 0 && errorCount > 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו, $errorCount שגיאות",
                                    Toast.LENGTH_LONG
                                ).show()

                            else ->
                                Toast.makeText(
                                    context,
                                    "שגיאה במחיקת הקבצים",
                                    Toast.LENGTH_SHORT
                                ).show()
                        }
                        refreshFiles()
                        selectedUris = emptySet()
                        confirmDeleteUris = null
                    }
                }) { Text("מחק") }
            },
            dismissButton = {
                Button(onClick = { confirmDeleteUris = null }) { Text("ביטול") }
            }
        )
    }

    // Rename dialog
    if (renameTarget != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { 
                renameTarget = null
                renameText = ""
            },
            title = { Text("שינוי שם מסמך") },
            text = {
                Column {
                    OutlinedTextField(
                        value = renameText,
                        onValueChange = { renameText = it },
                        label = { Text("שם קובץ") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val target = renameTarget ?: return@Button
                        val trimmedTitle = renameText.trim()
                        
                        if (trimmedTitle.isEmpty()) {
                            Toast.makeText(context, "שם הקובץ לא יכול להיות ריק", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        
                        try {
                            // Rename updates metadata title only - physical files are never renamed or moved
                            val filePath = target.file.absolutePath
                            val supplierIdStr = supplierId.toString()
                            
                            // Check for duplicate titles within the same supplier (optional)
                            val existingDocs = metadataStore.getDocumentsForSupplier(supplierIdStr)
                            val hasDuplicate = existingDocs.any { 
                                it.filePath != filePath && it.title == trimmedTitle 
                            }
                            
                            if (hasDuplicate) {
                                Toast.makeText(context, "קובץ עם שם זה כבר קיים", Toast.LENGTH_SHORT).show()
                                return@Button
                            }
                            
                            // Update metadata title only (no file rename)
                            metadataStore.renameDocumentTitle(supplierIdStr, filePath, trimmedTitle)
                            
                            Log.d("SupplierDocs", "Renamed metadata title for file '$filePath' to '$trimmedTitle'")
                            Toast.makeText(context, "השם שונה בהצלחה", Toast.LENGTH_SHORT).show()
                            refreshFiles()
                        } catch (e: Exception) {
                            Log.e("SupplierDocs", "Failed to rename metadata title for '${target.title}'", e)
                            Toast.makeText(context, "שגיאה בשינוי שם המסמך", Toast.LENGTH_SHORT).show()
                        }
                        
                        renameTarget = null
                        renameText = ""
                    }
                ) {
                    Text("אישור")
                }
            },
            dismissButton = {
                Button(onClick = { 
                    renameTarget = null
                    renameText = ""
                }) { 
                    Text("ביטול") 
                }
            }
        )
    }
}

@Composable
fun SuppliersListScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    reservationVm: com.rentacar.app.ui.vm.ReservationViewModel,
    pickMode: Boolean = false
) {
    val context = LocalContext.current
    val allSuppliers by vm.list.collectAsState()
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }
    var showCommissionDialog by rememberSaveable { mutableStateOf(false) }
    var showDocsDialog by rememberSaveable { mutableStateOf(false) }
    var showImportDialog by remember { mutableStateOf(false) }
    var showPriceListImportDialog by remember { mutableStateOf(false) }
    var showTemplateDialog by remember { mutableStateOf(false) }
    var showPriceListTemplateDialog by remember { mutableStateOf(false) }
    var showTemplateTypeDialog by remember { mutableStateOf(false) }
    var showImportTypeDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    var lastImportStatus by remember { mutableStateOf<String?>(null) }
    var canImport by remember { mutableStateOf(false) }
    var hasImportLogs by remember { mutableStateOf(false) }
    var refreshTrigger by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Apply search filter
    val list by remember(debouncedQuery, allSuppliers) {
        derivedStateOf {
            if (debouncedQuery.trim().isEmpty()) {
                allSuppliers
            } else {
                val q = debouncedQuery.trim().lowercase()
                allSuppliers.filter { supplier ->
                    val supplierName = supplier.name.lowercase()
                    val phone = (supplier.phone ?: "").lowercase()
                    val address = (supplier.address ?: "").lowercase()
                    val email = (supplier.email ?: "").lowercase()
                    
                    supplierName.contains(q) || 
                    phone.contains(q) || 
                    address.contains(q) ||
                    email.contains(q)
                }
            }
        }
    }

    // אם הפריט הנבחר נעלם מהרשימה – נבחר ראשון
    LaunchedEffect(list.size) {
        if (selectedId != null && !list.any { it.id == selectedId }) {
            if (list.isNotEmpty()) selectedId = list.first().id
        }
    }
    
    // Check if selected supplier has import function configured
    LaunchedEffect(selectedId, refreshTrigger) {
        if (selectedId != null) {
            val functionCode = withContext(Dispatchers.IO) {
                val db = com.rentacar.app.di.DatabaseModule.provideDatabase(context)
                val code = db.supplierDao().getImportFunctionCode(selectedId!!)
                android.util.Log.d("supplier_import", "load: supplierId=$selectedId, loadedImportType=$code")
                
                // Check if supplier has import logs
                val logCount = db.importLogDao().hasRunsForSupplier(selectedId!!)
                Pair(code, logCount > 0)
            }
            canImport = (functionCode.first != null)
            hasImportLogs = functionCode.second
        } else {
            canImport = false
            hasImportLogs = false
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            TitleBar(
                title = "ספקים",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
        Spacer(Modifier.height(12.dp))
        
        // Modern search bar
        AppSearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "חיפוש ספק לפי שם, טלפון או הערה..."
        )
        
        Spacer(Modifier.height(12.dp))

        // Show list or empty state
        if (list.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AppEmptySearchState(
                    message = if (debouncedQuery.isNotEmpty()) {
                        "לא נמצאו תוצאות תואמות לחיפוש שלך."
                    } else {
                        "אין ספקים להצגה."
                    }
                )
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                items(list, key = { it.id }) { supplier ->
                    val isSelected = supplier.id == selectedId

                    SupplierCard(
                        supplier = supplier,
                        isSelected = isSelected,
                        onClick = { selectedId = supplier.id },
                        onCallClick = {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:${supplier.phone}")
                            }
                            context.startActivity(intent)
                        }
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        if (pickMode) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                AppButton(
                    enabled = selectedId != null,
                    onClick = {
                        selectedId?.let { id ->
                            navController.previousBackStackEntry?.savedStateHandle?.set("picked_supplier_id", id)
                            navController.popBackStack()
                        }
                    }
                ) { Text("בחר") }
            }
            Spacer(Modifier.height(8.dp))
        }

        // כפתורי תחתית
        val canOpen = selectedId != null
        
        // שורה ראשונה: דוח, תבנית, ייבא, עמלה
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            FloatingActionButton(
                onClick = { 
                    if (canOpen) {
                        val now = java.util.Calendar.getInstance()
                        navController.navigate("monthly_report/${selectedId}/${now.get(java.util.Calendar.YEAR)}/${now.get(java.util.Calendar.MONTH) + 1}")
                    }
                },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📈", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("דוח", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { 
                    if (canOpen) {
                        showTemplateTypeDialog = true
                    }
                },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📋", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("תבנית", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { 
                    if (canOpen) {
                        showImportTypeDialog = true
                    }
                },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📊", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("ייבא", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { 
                    if (canOpen && hasImportLogs) {
                        navController.navigate("import_log/${selectedId}")
                    }
                },
                modifier = Modifier.alpha(if (canOpen && hasImportLogs) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📜", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("לוג", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) showCommissionDialog = true },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("עמלה", fontSize = 10.sp)
                }
            }
        }
        
        Spacer(Modifier.height(8.dp))
        
        // שורה שניה: מסמכים, סניפים, עריכה, מחיקה, חדש
        val selectedSupplier = list.firstOrNull { it.id == selectedId }
        val hasReservations = selectedSupplier?.id?.let { supplierId ->
            reservationVm.reservationsBySupplier(supplierId).collectAsState(initial = emptyList()).value.isNotEmpty()
        } ?: false
        val deleteEnabled = selectedId != null && !hasReservations
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            FloatingActionButton(
                onClick = { if (canOpen) showDocsDialog = true },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("מסמכים", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) navController.navigate("supplier_branches/$selectedId") },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("סניפים", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) navController.navigate("supplier_edit/${selectedId}") },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("✏️", fontSize = 16.sp, modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                    Spacer(Modifier.height(2.dp))
                    Text("עריכה", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (deleteEnabled) showConfirmDelete = true },
                modifier = Modifier.alpha(if (deleteEnabled) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("🗑", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("מחק", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { navController.navigate("supplier_edit") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Domain, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("חדש", fontSize = 10.sp)
                }
            }
        }

        // Import status message
        if (lastImportStatus != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = lastImportStatus!!,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                color = if (lastImportStatus!!.contains("נכשל")) 
                    androidx.compose.material3.MaterialTheme.colorScheme.error 
                else 
                    Color(0xFF4CAF50),
                modifier = Modifier.fillMaxWidth()
            )
        }

        // דיאלוג מחיקה
        if (showConfirmDelete) {
            val selectedSupplier2 = list.firstOrNull { it.id == selectedId }
            val hasReservations2 = selectedSupplier2?.id?.let { supplierId ->
                reservationVm.reservationsBySupplier(supplierId).collectAsState(initial = emptyList()).value.isNotEmpty()
            } ?: false

            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmDelete = false },
                title = { Text("מחיקת ספק") },
                text = {
                    if (hasReservations2) Text("לא ניתן למחוק ספק שבוצעה לו הזמנה בעבר!")
                    else Text("האם אתה בטוח שברצונך למחוק את הספק?")
                },
                confirmButton = {
                    if (!hasReservations2) {
                        androidx.compose.material3.Button(onClick = {
                            val id = selectedId
                            if (id != null) {
                                vm.delete(id)
                                selectedId = null
                            }
                            showConfirmDelete = false
                        }) { Text("מחק") }
                    }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { showConfirmDelete = false }) {
                        Text(if (hasReservations2) "אישור" else "ביטול")
                    }
                }
            )
        }
        }
        
        // Snackbar host
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }

    // דיאלוגים
    if (showCommissionDialog) {
        val selectedSupplier = list.firstOrNull { it.id == selectedId }
        if (selectedSupplier != null) {
            CommissionDialog(
                supplier = selectedSupplier,
                onDismiss = { showCommissionDialog = false },
                onSave = { updatedSupplier ->
                    vm.save(updatedSupplier) { }
                    showCommissionDialog = false
                }
            )
        }
    }

    if (showDocsDialog && selectedId != null) {
        // Navigate to full-screen documents screen instead of showing dialog
        navController.navigate("supplier_documents/$selectedId")
        showDocsDialog = false
    }

    if (showImportDialog && selectedId != null) {
        com.rentacar.app.ui.dialogs.ImportDialog(
            visible = true,
            supplierId = selectedId!!,
            onDismiss = { showImportDialog = false },
            onImported = { result ->
                val warn = if (result.warnings.isNotEmpty()) " (עם אזהרות)" else ""
                lastImportStatus = if (result.success) {
                    "ייבוא הצליח: ${result.totalRowsInFile} שורות | נוצרו ${result.createdCount} | עודכנו ${result.updatedCount} | דולגו ${result.skippedCount}$warn"
                } else {
                    "ייבוא נכשל: ${result.errors.joinToString("; ")}"
                }
            }
        )
    }

    if (showTemplateDialog && selectedId != null) {
        com.rentacar.app.ui.dialogs.TemplateSelectDialog(
            visible = true,
            supplierId = selectedId!!,
            onDismiss = { showTemplateDialog = false },
            onSaved = {
                // Template saved successfully - trigger refresh
                refreshTrigger++
            }
        )
    }

    if (showPriceListTemplateDialog && selectedId != null) {
        com.rentacar.app.ui.dialogs.PriceListTemplateSelectDialog(
            visible = true,
            supplierId = selectedId!!,
            onDismiss = { showPriceListTemplateDialog = false },
            onSaved = {
                // Price list template saved successfully
                showPriceListTemplateDialog = false
            }
        )
    }

    if (showPriceListImportDialog && selectedId != null) {
        val supplier = list.firstOrNull { it.id == selectedId }
        if (supplier != null) {
            com.rentacar.app.ui.dialogs.PriceListImportDialog(
                visible = true,
                supplierId = selectedId!!,
                supplierName = supplier.name,
                onDismiss = { showPriceListImportDialog = false },
                onImported = { result ->
                    val message = if (result.success) {
                        "יבוא מחירון הסתיים בהצלחה: ${result.totalRowsInFile} שורות"
                    } else {
                        "יבוא מחירון נכשל: ${result.errors.joinToString("; ")}"
                    }
                    scope.launch {
                        snackbarHostState.showSnackbar(message)
                    }
                    showPriceListImportDialog = false
                }
            )
        }
    }

    // Template type chooser dialog
    TemplateTypeChooserDialog(
        visible = showTemplateTypeDialog,
        onDismiss = { showTemplateTypeDialog = false },
        onInvoiceTemplateSelected = {
            showTemplateTypeDialog = false
            // Existing behavior for invoice template
            showTemplateDialog = true
        },
        onPriceListTemplateSelected = {
            showTemplateTypeDialog = false
            if (selectedId != null) {
                showPriceListTemplateDialog = true
            }
        }
    )

    // Import type chooser dialog
    ImportTypeChooserDialog(
        visible = showImportTypeDialog,
        onDismiss = { showImportTypeDialog = false },
        onInvoiceImportSelected = {
            showImportTypeDialog = false
            // Existing behavior for invoice import
            if (canImport) {
                showImportDialog = true
            } else {
                android.widget.Toast.makeText(
                    context,
                    "יש להגדיר סוג ייבוא לספק (לחץ על 'תבנית')",
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
        },
        onPriceListImportSelected = {
            showImportTypeDialog = false
            if (selectedId != null) {
                // Check if supplier has price list import function configured
                val supplier = list.firstOrNull { it.id == selectedId }
                val functionCode = supplier?.priceListImportFunctionCode
                
                if (functionCode == null || functionCode == PriceListImportFunctionCodes.NONE) {
                    // Show snackbar message
                    scope.launch {
                        snackbarHostState.showSnackbar("לפני יבוא מחירון יש להגדיר תבנית מחירון לספק")
                    }
                } else {
                    // Open price list import dialog
                    showPriceListImportDialog = true
                }
            }
        }
    )
}

@Composable
private fun CommissionDialog(
    supplier: Supplier,
    onDismiss: () -> Unit,
    onSave: (Supplier) -> Unit
) {
    val context = LocalContext.current
    val settingsStore = SettingsStore(context)
    val defC1 = settingsStore.commissionDays1to6().collectAsState(initial = "3").value
    val defC7 = settingsStore.commissionDays7to23().collectAsState(initial = "5").value
    val defC24 = settingsStore.commissionDays24plus().collectAsState(initial = "7").value

    var comm1to6 by rememberSaveable { mutableStateOf(supplier.commissionDays1to6?.toString() ?: defC1) }
    var comm7to23 by rememberSaveable { mutableStateOf(supplier.commissionDays7to23?.toString() ?: defC7) }
    var comm24plus by rememberSaveable { mutableStateOf(supplier.commissionDays24plus?.toString() ?: defC24) }
    var attemptedCommissionSave by rememberSaveable { mutableStateOf(false) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("הגדרות עמלה - ${supplier.name}") },
        text = {
            Column {
                Text("הגדר ימי עמלה לכל תקופה:")
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = comm1to6,
                        onValueChange = { v -> comm1to6 = v.filter { it.isDigit() }.take(2) },
                        label = { Text("1–6 ימים *") },
                        isError = attemptedCommissionSave && comm1to6.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = comm7to23,
                        onValueChange = { v -> comm7to23 = v.filter { it.isDigit() }.take(2) },
                        label = { Text("7–23 ימים *") },
                        isError = attemptedCommissionSave && comm7to23.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = comm24plus,
                        onValueChange = { v -> comm24plus = v.filter { it.isDigit() }.take(2) },
                        label = { Text("24+ ימים *") },
                        isError = attemptedCommissionSave && comm24plus.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text("טיפ: מי שלא רוצה עמלה יקליד אפס (0)")
            }
        },
        confirmButton = {
            androidx.compose.material3.Button(onClick = {
                if (comm1to6.isBlank() || comm7to23.isBlank() || comm24plus.isBlank()) {
                    attemptedCommissionSave = true
                    return@Button
                }
                val c1Int = comm1to6.toIntOrNull() ?: defC1.toIntOrNull() ?: 3
                val c7Int = comm7to23.toIntOrNull() ?: defC7.toIntOrNull() ?: 5
                val c24Int = comm24plus.toIntOrNull() ?: defC24.toIntOrNull() ?: 7
                onSave(
                    supplier.copy(
                        commissionDays1to6 = c1Int,
                        commissionDays7to23 = c7Int,
                        commissionDays24plus = c24Int
                    )
                )
            }) { Text("שמור") }
        },
        dismissButton = {
            androidx.compose.material3.Button(onClick = onDismiss) { Text("ביטול") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplierEditScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long? = null
) {
    val context = LocalContext.current
    val list by vm.list.collectAsState()
    val existing = list.firstOrNull { it.id == supplierId }

    val settingsStore = SettingsStore(context)
    val defC1 = settingsStore.commissionDays1to6().collectAsState(initial = "3").value
    val defC7 = settingsStore.commissionDays7to23().collectAsState(initial = "5").value
    val defC24 = settingsStore.commissionDays24plus().collectAsState(initial = "7").value

    var name by rememberSaveable { mutableStateOf(existing?.name ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var address by rememberSaveable { mutableStateOf(existing?.address ?: "") }
    var taxId by rememberSaveable { mutableStateOf(existing?.taxId ?: "") }
    var email by rememberSaveable { mutableStateOf(existing?.email ?: "") }
    var comm1to6 by rememberSaveable { mutableStateOf(existing?.commissionDays1to6?.toString() ?: defC1) }
    var comm7to23 by rememberSaveable { mutableStateOf(existing?.commissionDays7to23?.toString() ?: defC7) }
    var comm24plus by rememberSaveable { mutableStateOf(existing?.commissionDays24plus?.toString() ?: defC24) }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }

    val isEdit = existing != null

    LaunchedEffect(existing?.id) {
        if (existing != null) {
            name = existing.name
            phone = existing.phone ?: ""
            address = existing.address ?: ""
            taxId = existing.taxId ?: ""
            email = existing.email ?: ""
            comm1to6 = existing.commissionDays1to6?.toString() ?: defC1
            comm7to23 = existing.commissionDays7to23?.toString() ?: defC7
            comm24plus = existing.commissionDays24plus?.toString() ?: defC24
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 80.dp)
                .verticalScroll(rememberScrollState())
        ) {
            TitleBar(
                title = if (isEdit) "עריכת ספק" else "ספק חדש",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            Spacer(Modifier.height(16.dp))

        // פרטי ספק - Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // כותרת הקטגוריה
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Domain,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "פרטי חברה",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(Modifier.height(12.dp))
                
                // שם חברה
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("שם חברה *") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Domain,
                            contentDescription = null,
                            tint = if (attemptedSave && name.isBlank()) 
                                MaterialTheme.colorScheme.error 
                            else 
                                MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    isError = attemptedSave && name.isBlank(),
                    colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                        containerColor = if (name.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                    ),
                    supportingText = { if (attemptedSave && name.isBlank()) Text("שדה חובה") },
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // ח.פ.
                OutlinedTextField(
                    value = taxId,
                    onValueChange = { taxId = it },
                    label = { Text("ח.פ.") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        
        Spacer(Modifier.height(16.dp))
        
        // פרטי קשר - Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // כותרת הקטגוריה
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Phone,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "פרטי קשר",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(Modifier.height(12.dp))
                
                // טלפון
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("טלפון") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = KeyboardType.Phone
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // כתובת
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("כתובת") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // Email
                OutlinedTextField(
                    value = email,
                    onValueChange = { new ->
                        val allowed: (Char) -> Boolean = { ch ->
                            (ch in 'a'..'z') || (ch in 'A'..'Z') || ch.isDigit() || ch in setOf('@', '.', '_', '-', '+', '\'')
                        }
                        email = new.filter(allowed)
                    },
                    label = { Text("Email", textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth()) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                    textStyle = TextStyle(textDirection = TextDirection.Ltr),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        }
    
        // Fixed bottom action bar
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val isSaveEnabled = name.isNotBlank()

            // כפתור ביטול
            FloatingActionButton(
                onClick = { navController.popBackStack() },
                modifier = Modifier.weight(1f),
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp)) {
                    Text("❌", fontSize = 18.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("בטל", fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
            }

            // כפתור שמירה
            FloatingActionButton(
                onClick = {
                    if (name.isBlank()) {
                        attemptedSave = true
                        Toast.makeText(context, "יש למלא שם חברה", Toast.LENGTH_SHORT).show()
                        return@FloatingActionButton
                    }

                    val c1Int = (comm1to6.ifBlank { defC1 }).toIntOrNull() ?: defC1.toIntOrNull() ?: 3
                    val c7Int = (comm7to23.ifBlank { defC7 }).toIntOrNull() ?: defC7.toIntOrNull() ?: 5
                    val c24Int = (comm24plus.ifBlank { defC24 }).toIntOrNull() ?: defC24.toIntOrNull() ?: 7

                    val supplierToSave =
                        if (supplierId != null && supplierId != 0L) {
                            // Preserve importFunctionCode and importTemplateId when updating existing supplier
                            Supplier(
                                id = supplierId,
                                name = name,
                                phone = phone.ifBlank { null },
                                address = address.ifBlank { null },
                                taxId = taxId.ifBlank { null },
                                email = email.ifBlank { null },
                                commissionDays1to6 = c1Int,
                                commissionDays7to23 = c7Int,
                                commissionDays24plus = c24Int,
                                importFunctionCode = existing?.importFunctionCode,
                                importTemplateId = existing?.importTemplateId,
                                activeTemplateId = existing?.activeTemplateId
                            )
                        } else {
                            Supplier(
                                name = name,
                                phone = phone.ifBlank { null },
                                address = address.ifBlank { null },
                                taxId = taxId.ifBlank { null },
                                email = email.ifBlank { null },
                                commissionDays1to6 = c1Int,
                                commissionDays7to23 = c7Int,
                                commissionDays24plus = c24Int
                            )
                        }

                    vm.save(supplierToSave) { navController.popBackStack() }
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (isSaveEnabled) 1f else 0.5f),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp)) {
                    Text("💾", fontSize = 18.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Spacer(Modifier.height(2.dp))
                    Text("שמור", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplierBranchesScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long,
    reservationVm: com.rentacar.app.ui.vm.ReservationViewModel,
    context: android.content.Context = LocalContext.current
) {
    var selectedBranchId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }

    val branches = vm.branches(supplierId).collectAsState(initial = emptyList()).value

    LaunchedEffect(supplierId) {
        navController.previousBackStackEntry?.savedStateHandle?.set("selected_supplier_id", supplierId)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp).padding(bottom = 80.dp)) {
            TitleBar("סניפי ספק", LocalTitleColor.current, onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Suppliers) })
            Spacer(Modifier.height(12.dp))
            val itemsUi = branches.map { b ->
                val sub = listOfNotNull(b.street, b.phone).joinToString(" · ")
                ListItemModel(id = b.id, title = b.city ?: "", subtitle = sub, meta = "", icon = Icons.Filled.LocationOn)
            }
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(itemsUi, key = { item -> item.id ?: (item.title + (item.subtitle ?: "")).hashCode().toLong() }) { item ->
                    val b = branches.firstOrNull { it.id == item.id }
                    val isSelected = b?.id == selectedBranchId
                    val context = LocalContext.current
                    
                    BranchCard(
                        branch = b!!,
                        isSelected = isSelected,
                        onClick = { selectedBranchId = b.id },
                        onCallClick = if (!b.phone.isNullOrBlank()) {
                            {
                                val intent = Intent(Intent.ACTION_DIAL).apply {
                                    data = Uri.parse("tel:${b.phone}")
                                }
                                context.startActivity(intent)
                            }
                        } else null
                    )
                }
            }
        }

        Row(
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)
        ) {
            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp).alpha(if (selectedBranchId != null) 1f else 0.3f),
                onClick = { if (selectedBranchId != null) navController.navigate("branch_edit/$supplierId/$selectedBranchId") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("✏️", modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "עריכה", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }

            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp),
                onClick = { navController.navigate("branch_edit/$supplierId") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "חדש", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }

            val selectedBranch = branches.firstOrNull { it.id == selectedBranchId }
            val hasReservations = selectedBranch?.id?.let { branchId ->
                reservationVm.reservationsByBranch(branchId).collectAsState(initial = emptyList()).value.isNotEmpty()
            } ?: false
            val deleteEnabled = selectedBranchId != null && !hasReservations

            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp).alpha(if (deleteEnabled) 1f else 0.3f),
                onClick = { if (deleteEnabled) showConfirmDelete = true }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "מחק", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }
        }
    }

    if (showConfirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showConfirmDelete = false },
            title = { Text("מחיקת סניף") },
            text = {
                val selectedBranch2 = branches.firstOrNull { it.id == selectedBranchId }
                val hasReservations2 = selectedBranch2?.id?.let { branchId ->
                    reservationVm.reservationsByBranch(branchId).collectAsState(initial = emptyList()).value.isNotEmpty()
                } ?: false
                if (hasReservations2) Text("לא ניתן למחוק סניף שבוצעה לו הזמנה בעבר!")
                else Text("האם אתה בטוח שברצונך למחוק את הסניף?")
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        selectedBranchId?.let { id ->
                            vm.deleteBranch(id)
                            selectedBranchId = null
                        }
                        showConfirmDelete = false
                    }
                ) { Text("מחק") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { showConfirmDelete = false }
                ) { Text("בטל") }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BranchEditScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long,
    branchId: Long? = null
) {
    val branches = vm.branches(supplierId).collectAsState(initial = emptyList()).value
    val existing = branchId?.let { id -> branches.firstOrNull { it.id == id } }

    var branchCity by rememberSaveable { mutableStateOf(existing?.city ?: "") }
    var branchStreet by rememberSaveable { mutableStateOf(existing?.street ?: "") }
    var branchPhone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }

    val isEdit = existing != null
    val salmon = Color(0xFFFA8072)

    LaunchedEffect(existing?.id) {
        if (existing != null) {
            branchCity = existing.city ?: ""
            branchStreet = existing.street ?: ""
            branchPhone = existing.phone ?: ""
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = if (isEdit) "עריכת סניף" else "סניף חדש",
            color = LocalTitleColor.current,
            onHomeClick = { navController.popBackStack() }
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = branchCity,
            onValueChange = { branchCity = it },
            label = { Text("עיר *") },
            singleLine = true,
            isError = attemptedSave && branchCity.isBlank(),
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (branchCity.isBlank()) salmon else Color.Unspecified
            ),
            supportingText = { if (attemptedSave && branchCity.isBlank()) Text("שדה חובה") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = branchStreet,
            onValueChange = { branchStreet = it },
            label = { Text("רחוב *") },
            singleLine = true,
            isError = attemptedSave && branchStreet.isBlank(),
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (branchStreet.isBlank()) salmon else Color.Unspecified
            ),
            supportingText = { if (attemptedSave && branchStreet.isBlank()) Text("שדה חובה") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = branchPhone,
            onValueChange = { branchPhone = it },
            label = { Text("טלפון") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            FloatingActionButton(onClick = { navController.popBackStack() }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("✖")
                    Spacer(Modifier.height(2.dp))
                    Text("בטל", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = {
                    if (branchCity.isBlank() || branchStreet.isBlank()) {
                        attemptedSave = true
                        return@FloatingActionButton
                    }
                    
                    if (isEdit && existing != null) {
                        // עדכון סניף קיים
                        val updatedBranch = existing.copy(
                            name = branchCity,
                            city = branchCity,
                            street = branchStreet,
                            phone = branchPhone.ifBlank { null }
                        )
                        vm.updateBranch(updatedBranch) {
                            navController.popBackStack()
                        }
                    } else {
                        // יצירת סניף חדש
                        vm.addBranch(
                            supplierId = supplierId,
                            name = branchCity,
                            city = branchCity,
                            street = branchStreet,
                            phone = branchPhone.ifBlank { null }
                        ) {
                            navController.popBackStack()
                        }
                    }
                }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("💾")
                    Spacer(Modifier.height(2.dp))
                    Text("שמור", fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun TemplateTypeChooserDialog(
    visible: Boolean,
    onDismiss: () -> Unit,
    onInvoiceTemplateSelected: () -> Unit,
    onPriceListTemplateSelected: () -> Unit
) {
    if (!visible) return

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = "בחר סוג תבנית")
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "בחר סוג תבנית שברצונך להגדיר לספק זה.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onInvoiceTemplateSelected,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("🧾 תבנית חשבוניות")
                }
                Button(
                    onClick = onPriceListTemplateSelected,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("💰 תבנית מחירון")
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) {
                Text("סגור")
            }
        }
    )
}

@Composable
private fun ImportTypeChooserDialog(
    visible: Boolean,
    onDismiss: () -> Unit,
    onInvoiceImportSelected: () -> Unit,
    onPriceListImportSelected: () -> Unit
) {
    if (!visible) return

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = "בחר סוג יבוא")
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "בחר איזה סוג נתונים לייבא עבור ספק זה.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = onInvoiceImportSelected,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("🧾 ייבוא חשבוניות")
                }
                Button(
                    onClick = onPriceListImportSelected,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("💰 ייבוא מחירון")
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) {
                Text("סגור")
            }
        }
    )
}
