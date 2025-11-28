package com.rentacar.app.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class VideoMergerUiState(
    val sourcePath: String,
    val destinationPath: String,
    val isRunning: Boolean,
    val processedFiles: Int,
    val totalFiles: Int,
    val progress: Float,
    val eta: String,
    val startTime: String,
    val finishTime: String,
    val currentBatch: Int,
    val totalBatches: Int,
    val errorCount: Int,
    val logEntries: List<VideoMergerLogEntry>
)

data class VideoMergerLogEntry(
    val timestamp: String,
    val type: VideoMergerLogType,
    val message: String,
    val emphasis: Float = 1f
)

enum class VideoMergerLogType { INFO, SUCCESS, WARNING }

@Composable
fun VideoMergerScreen(
    state: VideoMergerUiState,
    onBrowseSource: () -> Unit,
    onBrowseDestination: () -> Unit,
    onStartClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
            .padding(24.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF1E293B).copy(alpha = 0.9f))
        ) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color.White.copy(alpha = 0.1f),
                                Color.White.copy(alpha = 0.05f)
                            )
                        )
                    )
            )
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 36.dp)
            ) {
                HeaderSection(
                    title = "Video Merger Pro",
                    subtitle = "Batch video processing with ffmpeg",
                    isRunning = state.isRunning,
                    onStartClick = onStartClick
                )

                Spacer(modifier = Modifier.height(32.dp))

                PathSection(
                    label = "Source:",
                    path = state.sourcePath,
                    onBrowse = onBrowseSource
                )

                Spacer(modifier = Modifier.height(24.dp))

                PathSection(
                    label = "Destination:",
                    path = state.destinationPath,
                    onBrowse = onBrowseDestination
                )

                Spacer(modifier = Modifier.height(28.dp))

                Divider(
                    color = Color(0x80334155),
                    thickness = 1.dp
                )

                Spacer(modifier = Modifier.height(28.dp))

                ProgressSection(state = state)

                Spacer(modifier = Modifier.height(32.dp))

                Divider(
                    color = Color(0x80334155),
                    thickness = 1.dp
                )

                Spacer(modifier = Modifier.height(28.dp))

                ActivityLogSection(state.logEntries)

                Spacer(modifier = Modifier.height(32.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    Text(
                        text = "Batches: ${state.currentBatch} / ${state.totalBatches}    Errors: ${state.errorCount} files",
                        color = Color(0xFF64748B),
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun HeaderSection(
    title: String,
    subtitle: String,
    isRunning: Boolean,
    onStartClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = Color(0xFFF1F5F9),
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                color = Color(0xFF94A3B8),
                fontSize = 14.sp
            )
        }
        StartButton(isRunning = isRunning, onStartClick = onStartClick)
    }
}

@Composable
private fun StartButton(
    isRunning: Boolean,
    onStartClick: () -> Unit
) {
    val containerColor = if (isRunning) Color(0xFF10B981) else Color(0xFF2563EB)
    val contentColor = if (isRunning) Color.White else Color.White

    Button(
        onClick = onStartClick,
        enabled = !isRunning,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor,
            disabledContentColor = contentColor
        ),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 24.dp, vertical = 14.dp)
    ) {
        if (isRunning) {
            val transition = rememberInfiniteTransition(label = "pulse")
            val pulse by transition.animateFloat(
                initialValue = 1f,
                targetValue = 0.3f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 1500, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "pulseAlpha"
            )
            Box(
                modifier = Modifier
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(Color.White)
                    .alpha(pulse)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "Running...",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
        } else {
            Text(
                text = "Start Merge",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun PathSection(
    label: String,
    path: String,
    onBrowse: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            color = Color(0xFFCbd5E1),
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF334155))
                    .border(
                        width = 1.dp,
                        color = Color(0xFF475569),
                        shape = RoundedCornerShape(8.dp)
                    )
                    .padding(horizontal = 20.dp, vertical = 14.dp)
            ) {
                Text(
                    text = path,
                    color = Color(0xFFE2E8F0),
                    fontSize = 14.sp
                )
            }
            Spacer(modifier = Modifier.width(18.dp))
            BrowseButton(onBrowse = onBrowse)
        }
    }
}

@Composable
private fun BrowseButton(onBrowse: () -> Unit) {
    Button(
        onClick = onBrowse,
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF475569)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF64748B)),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 12.dp)
    ) {
        CirclePlusIcon()
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = "Browse...",
            color = Color(0xFFCbd5E1),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun CirclePlusIcon() {
    Canvas(modifier = Modifier.size(20.dp)) {
        val strokeWidth = 1.5.dp.toPx()
        val radius = size.minDimension / 2f - strokeWidth / 2f
        drawCircle(
            color = Color(0xFF94A3B8),
            radius = radius,
            style = Stroke(width = strokeWidth)
        )
        val centerX = size.width / 2f
        val centerY = size.height / 2f
        val lineLength = radius * 0.6f
        drawLine(
            color = Color(0xFF94A3B8),
            start = androidx.compose.ui.geometry.Offset(centerX - lineLength, centerY),
            end = androidx.compose.ui.geometry.Offset(centerX + lineLength, centerY),
            strokeWidth = strokeWidth
        )
        drawLine(
            color = Color(0xFF94A3B8),
            start = androidx.compose.ui.geometry.Offset(centerX, centerY - lineLength),
            end = androidx.compose.ui.geometry.Offset(centerX, centerY + lineLength),
            strokeWidth = strokeWidth
        )
    }
}

@Composable
private fun ProgressSection(state: VideoMergerUiState) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Overall Progress",
            color = Color(0xFFF1F5F9),
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        )

        Spacer(modifier = Modifier.height(20.dp))

        val targetProgress = state.progress.coerceIn(0f, 1f)
        val animatedProgress by animateFloatAsState(
            targetValue = targetProgress,
            animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
            label = "overall-progress"
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(Color(0xFF334155))
                .border(
                    width = 1.dp,
                    color = Color(0xFF334155),
                    shape = RoundedCornerShape(7.dp)
                )
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(animatedProgress)
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                Color(0xFF3B82F6),
                                Color(0xFF60A5FA)
                            )
                        )
                    )
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "${(targetProgress * 100).toInt()}%  (${state.processedFiles} / ${state.totalFiles} files)",
            color = Color(0xFFCbd5E1),
            fontSize = 15.sp
        )

        Spacer(modifier = Modifier.height(28.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            InfoPanel(state = state)
        }
    }
}

@Composable
private fun InfoPanel(state: VideoMergerUiState) {
    Column(
        modifier = Modifier
            .width(250.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x99334155))
            .padding(horizontal = 20.dp, vertical = 18.dp)
    ) {
        InfoRow(label = "ETA:", value = state.eta, valueColor = Color(0xFF60A5FA), isStrong = true)
        Spacer(modifier = Modifier.height(10.dp))
        InfoRow(label = "Start Time:", value = state.startTime, valueColor = Color(0xFFE2E8F0))
        Spacer(modifier = Modifier.height(10.dp))
        InfoRow(label = "Finish Time:", value = state.finishTime, valueColor = Color(0xFF10B981), isStrong = true)
    }
}

@Composable
private fun InfoRow(
    label: String,
    value: String,
    valueColor: Color,
    isStrong: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = Color(0xFF94A3B8),
            fontSize = 13.sp
        )
        Text(
            text = value,
            color = valueColor,
            fontSize = if (isStrong) 15.sp else 14.sp,
            fontWeight = if (isStrong) FontWeight.SemiBold else FontWeight.Medium
        )
    }
}

@Composable
private fun ActivityLogSection(entries: List<VideoMergerLogEntry>) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Activity Log",
            color = Color(0xFFF1F5F9),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(18.dp))
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF1E293B))
                .border(
                    width = 1.dp,
                    color = Color(0xFF334155),
                    shape = RoundedCornerShape(8.dp)
                )
                .padding(horizontal = 20.dp, vertical = 22.dp)
        ) {
            entries.forEach { entry ->
                LogEntryRow(entry = entry)
            }
        }
    }
}

@Composable
private fun LogEntryRow(entry: VideoMergerLogEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(entry.emphasis)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = entry.timestamp,
            color = Color(0xFF64748B),
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace
        )
        Spacer(modifier = Modifier.width(24.dp))
        LogIndicator(type = entry.type)
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = entry.message,
            color = when (entry.type) {
                VideoMergerLogType.WARNING -> Color(0xFFFBBF24)
                else -> Color(0xFFCbd5E1)
            },
            fontSize = 13.sp
        )
    }
}

@Composable
private fun LogIndicator(type: VideoMergerLogType) {
    val indicatorSize = 12.dp
    Canvas(modifier = Modifier.size(indicatorSize)) {
        val strokeWidth = 1.5.dp.toPx()
        val radius = size.minDimension / 2f - strokeWidth / 2f
        when (type) {
            VideoMergerLogType.INFO -> {
                drawCircle(color = Color(0xFF3B82F6))
            }

            VideoMergerLogType.SUCCESS -> {
                drawCircle(color = Color(0xFF10B981))
            }

            VideoMergerLogType.WARNING -> {
                drawCircle(
                    color = Color(0xFFF59E0B),
                    radius = radius,
                    style = Stroke(width = strokeWidth),
                    center = center
                )
                val triangle = Path().apply {
                    moveTo(center.x, 0f)
                    lineTo(center.x + radius * 0.4f, radius * 0.8f)
                    lineTo(center.x - radius * 0.4f, radius * 0.8f)
                    close()
                }
                drawPath(
                    path = triangle,
                    color = Color(0xFFF59E0B)
                )
            }
        }
    }
}

@Preview(name = "Video Merger Pro", showBackground = true, backgroundColor = 0xFF0F172A)
@Composable
private fun VideoMergerScreenPreview() {
    val state = VideoMergerUiState(
        sourcePath = "C:\\\\Cameras\\\\FrontDoor\\\\",
        destinationPath = "D:\\\\Archive\\\\2025\\\\",
        isRunning = true,
        processedFiles = 210,
        totalFiles = 840,
        progress = 0.35f,
        eta = "00:32:45",
        startTime = "10:51:20",
        finishTime = "11:24:05",
        currentBatch = 3,
        totalBatches = 8,
        errorCount = 5,
        logEntries = listOf(
            VideoMergerLogEntry(
                timestamp = "[10:52:03]",
                type = VideoMergerLogType.INFO,
                message = "Started file scan",
                emphasis = 0.9f
            ),
            VideoMergerLogEntry(
                timestamp = "[10:52:40]",
                type = VideoMergerLogType.SUCCESS,
                message = "Batch 1/8 completed",
                emphasis = 0.85f
            ),
            VideoMergerLogEntry(
                timestamp = "[10:53:12]",
                type = VideoMergerLogType.WARNING,
                message = "Warning: corrupt file moved to Errors",
                emphasis = 0.8f
            ),
            VideoMergerLogEntry(
                timestamp = "[10:53:45]",
                type = VideoMergerLogType.SUCCESS,
                message = "Batch 2/8 completed",
                emphasis = 0.75f
            )
        )
    )

    VideoMergerScreen(
        state = state,
        onBrowseSource = {},
        onBrowseDestination = {},
        onStartClick = {}
    )
}
