#!/bin/bash
# =============================================================================
# sync-to-vps.sh
# Upload updated Besu config files from local Windows machine to VPS.
# Run from Git Bash in the project root.
#
# USAGE:
#   chmod +x sync-to-vps.sh
#   ./sync-to-vps.sh
#
# CONFIGURE the variables below before first use.
# =============================================================================

# ── VPS Configuration — edit these ──────────────────────────────────────────
VPS_USER="ubuntu"                    # your VPS SSH username (ubuntu, root, etc.)
VPS_IP="YOUR_VPS_IP_HERE"           # e.g. 65.21.100.200
VPS_BESU_DIR="~/besu-cluster"       # path on VPS where besu files live
SSH_KEY=""                           # path to SSH key, e.g. ~/.ssh/id_rsa
                                     # leave empty "" to use password auth
# ────────────────────────────────────────────────────────────────────────────

# Files to sync
FILES=(
    "besu/setup-besu-cluster.sh"
    "besu/qbftConfigFile.json"
)

# Build scp options
SCP_OPTS="-o StrictHostKeyChecking=no"
if [ -n "${SSH_KEY}" ]; then
    SCP_OPTS="${SCP_OPTS} -i ${SSH_KEY}"
fi

echo "━━━ Syncing Besu files to VPS ━━━"
echo "  Target: ${VPS_USER}@${VPS_IP}:${VPS_BESU_DIR}"
echo ""

# Upload each file
for file in "${FILES[@]}"; do
    filename=$(basename "${file}")
    echo -n "  Uploading ${filename}... "

    scp ${SCP_OPTS} \
        "${file}" \
        "${VPS_USER}@${VPS_IP}:${VPS_BESU_DIR}/${filename}"

    echo "✓ done"
done

echo ""
echo "✓ All files uploaded. Existing files on VPS were overwritten."
echo ""
echo "Next — on your VPS:"
echo "  cd ${VPS_BESU_DIR}"
echo "  chmod +x setup-besu-cluster.sh"
echo "  ./setup-besu-cluster.sh"
