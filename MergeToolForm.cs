using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace VideoMergeTool
{
    public class MergeToolForm : Form
    {
        private RoundedPanel cardPanel;
        private TextBox sourceTextBox;
        private TextBox destinationTextBox;
        private ModernButton actionButton;
        private Label progressDetailsLabel;
        private Label etaLabel;
        private Label startTimeLabel;
        private Label finishTimeLabel;
        private Label batchesLabel;
        private RoundedPanel progressTrack;
        private Panel progressFill;
        private ListView logListView;

        public MergeToolForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            Font = new Font("Segoe UI", 10F);
            Text = "Timeline Merger";
            BackColor = Color.FromArgb(20, 24, 35);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(960, 620);
            DoubleBuffered = true;

            cardPanel = new RoundedPanel
            {
                CornerRadius = 16,
                BackColor = Color.FromArgb(32, 38, 52),
                Padding = new Padding(24),
                Size = new Size(880, 540),
                Location = new Point((ClientSize.Width - 880) / 2, (ClientSize.Height - 540) / 2),
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
            };
            Controls.Add(cardPanel);

            var sourceLabel = CreateSectionLabel("Source:");
            sourceLabel.Location = new Point(16, 16);
            cardPanel.Controls.Add(sourceLabel);

            sourceTextBox = CreatePathTextBox(@"C:\Cameras\FrontDoor\");
            sourceTextBox.Location = new Point(110, 12);
            cardPanel.Controls.Add(sourceTextBox);

            var sourceBrowse = CreateBrowseButton();
            sourceBrowse.Location = new Point(728, 12);
            cardPanel.Controls.Add(sourceBrowse);

            var destinationLabel = CreateSectionLabel("Destination:");
            destinationLabel.Location = new Point(16, 62);
            cardPanel.Controls.Add(destinationLabel);

            destinationTextBox = CreatePathTextBox(@"D:\Archive\2025\");
            destinationTextBox.Location = new Point(110, 58);
            cardPanel.Controls.Add(destinationTextBox);

            var destinationBrowse = CreateBrowseButton();
            destinationBrowse.Location = new Point(728, 58);
            cardPanel.Controls.Add(destinationBrowse);

            actionButton = new ModernButton
            {
                Text = "Start",
                Location = new Point(660, 112),
                Size = new Size(180, 48),
                BackColor = Color.FromArgb(74, 76, 89),
                ForeColor = Color.White,
                Font = new Font("Segoe UI Semibold", 12F),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            cardPanel.Controls.Add(actionButton);

            var progressTitle = new Label
            {
                Text = "Overall Progress",
                Font = new Font("Segoe UI Semibold", 12.5F),
                ForeColor = Color.White,
                AutoSize = true,
                Location = new Point(16, 126)
            };
            cardPanel.Controls.Add(progressTitle);

            progressTrack = new RoundedPanel
            {
                BackColor = Color.FromArgb(42, 54, 72),
                CornerRadius = 10,
                Size = new Size(500, 26),
                Location = new Point(16, 162)
            };
            cardPanel.Controls.Add(progressTrack);

            progressFill = new Panel
            {
                BackColor = Color.FromArgb(68, 132, 255),
                Size = new Size((int)(progressTrack.Width * 0.35), progressTrack.Height),
                Location = new Point(0, 0)
            };
            progressTrack.Controls.Add(progressFill);

            progressDetailsLabel = new Label
            {
                Text = "35%  (210 / 840 files)",
                ForeColor = Color.FromArgb(176, 190, 210),
                AutoSize = true,
                Location = new Point(16, 198)
            };
            cardPanel.Controls.Add(progressDetailsLabel);

            var infoPanel = new RoundedPanel
            {
                BackColor = Color.FromArgb(36, 48, 66),
                CornerRadius = 12,
                Size = new Size(220, 108),
                Location = new Point(580, 162),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Padding = new Padding(16)
            };
            cardPanel.Controls.Add(infoPanel);

            etaLabel = CreateInfoLabel("ETA: 00:32:45");
            etaLabel.Location = new Point(0, 0);
            infoPanel.Controls.Add(etaLabel);

            startTimeLabel = CreateInfoLabel("Start Time: 10:51:20");
            startTimeLabel.Location = new Point(0, 32);
            infoPanel.Controls.Add(startTimeLabel);

            finishTimeLabel = CreateInfoLabel("Finish Time: 11:24:05");
            finishTimeLabel.Location = new Point(0, 64);
            infoPanel.Controls.Add(finishTimeLabel);

            var logLabel = new Label
            {
                Text = "Activity Log",
                Font = new Font("Segoe UI Semibold", 12F),
                ForeColor = Color.White,
                AutoSize = true,
                Location = new Point(16, 240)
            };
            cardPanel.Controls.Add(logLabel);

            logListView = new ListView
            {
                BackColor = Color.FromArgb(28, 32, 44),
                ForeColor = Color.FromArgb(214, 225, 240),
                BorderStyle = BorderStyle.None,
                HeaderStyle = ColumnHeaderStyle.None,
                FullRowSelect = true,
                View = View.Details,
                Size = new Size(700, 210),
                Location = new Point(16, 272)
            };
            logListView.Columns.Add("Time", 120);
            logListView.Columns.Add("Status", 120);
            logListView.Columns.Add("Message", 420);
            logListView.Items.Add(CreateLogItem("10:52:03", "Info", "Started file scan"));
            logListView.Items.Add(CreateLogItem("10:52:40", "Success", "Batch 1/8 completed"));
            logListView.Items.Add(CreateLogItem("10:53:12", "Warning", "Warning: corrupt file moved to Errors"));
            cardPanel.Controls.Add(logListView);

            batchesLabel = new Label
            {
                Text = "Batches: 3 / 8    Errors: 5 files",
                ForeColor = Color.FromArgb(123, 134, 150),
                AutoSize = true,
                Location = new Point(cardPanel.Width - 240, cardPanel.Height - 36),
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right
            };
            cardPanel.Controls.Add(batchesLabel);

            cardPanel.Resize += (s, e) =>
            {
                batchesLabel.Location = new Point(cardPanel.Width - batchesLabel.Width - 24, cardPanel.Height - 36);
                progressFill.Width = (int)(progressTrack.Width * 0.35);
            };
        }

        private Label CreateSectionLabel(string text)
        {
            return new Label
            {
                Text = text,
                ForeColor = Color.FromArgb(173, 184, 204),
                AutoSize = true,
                Font = new Font("Segoe UI", 10F)
            };
        }

        private TextBox CreatePathTextBox(string path)
        {
            return new TextBox
            {
                Text = path,
                ForeColor = Color.FromArgb(214, 225, 240),
                BackColor = Color.FromArgb(28, 32, 44),
                BorderStyle = BorderStyle.FixedSingle,
                Width = 600
            };
        }

        private ModernButton CreateBrowseButton()
        {
            return new ModernButton
            {
                Text = "Browse…",
                Size = new Size(120, 34),
                BackColor = Color.FromArgb(50, 56, 72),
                ForeColor = Color.FromArgb(214, 225, 240),
                Font = new Font("Segoe UI Semibold", 10F)
            };
        }

        private Label CreateInfoLabel(string text)
        {
            return new Label
            {
                Text = text,
                ForeColor = Color.FromArgb(205, 215, 233),
                AutoSize = true,
                Font = new Font("Segoe UI", 10F)
            };
        }

        private ListViewItem CreateLogItem(string time, string status, string message)
        {
            var item = new ListViewItem($"[{time}]");
            item.SubItems.Add(status);
            item.SubItems.Add(message);
            item.ForeColor = status == "Warning"
                ? Color.FromArgb(255, 178, 102)
                : status == "Success"
                    ? Color.FromArgb(140, 222, 144)
                    : Color.FromArgb(214, 225, 240);
            return item;
        }

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MergeToolForm());
        }
    }

    public class RoundedPanel : Panel
    {
        public int CornerRadius { get; set; } = 12;

        public RoundedPanel()
        {
            DoubleBuffered = true;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = GetRoundedRectanglePath(ClientRectangle, CornerRadius))
            using (var brush = new SolidBrush(BackColor))
            {
                e.Graphics.FillPath(brush, path);
            }
        }

        private GraphicsPath GetRoundedRectanglePath(Rectangle rect, int radius)
        {
            var path = new GraphicsPath();
            int d = radius * 2;
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    public class ModernButton : Button
    {
        public ModernButton()
        {
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(Enabled ? BackColor : Color.FromArgb(68, 132, 112)))
            using (var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
            {
                var rect = new Rectangle(0, 0, Width, Height);
                pevent.Graphics.FillRectangle(brush, rect);
                pevent.Graphics.DrawString(Text, Font, new SolidBrush(ForeColor), rect, format);
            }
        }
    }
}
