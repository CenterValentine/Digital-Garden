/**
 * Fix displayOrder values in ContentNode table
 *
 * This script renumbers all siblings under each parent to have sequential
 * displayOrder values (0, 1, 2, 3...) with no duplicates or gaps.
 */

import { prisma } from '../lib/database/client';

async function fixDisplayOrder() {
  console.log('🔍 Analyzing ContentNode displayOrder values...\n');

  // Get all content nodes grouped by parent
  const allNodes = await prisma.contentNode.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      parentId: true,
      displayOrder: true,
    },
    orderBy: [
      { parentId: 'asc' },
      { displayOrder: 'asc' },
      { title: 'asc' },
    ],
  });

  // Group by parent
  const byParent = allNodes.reduce((acc, node) => {
    const key = node.parentId || 'ROOT';
    if (!acc[key]) acc[key] = [];
    acc[key].push(node);
    return acc;
  }, {} as Record<string, typeof allNodes>);

  console.log(`Found ${Object.keys(byParent).length} parent groups\n`);

  // Check for issues
  let issueCount = 0;
  for (const [parentId, nodes] of Object.entries(byParent)) {
    const displayOrders = nodes.map(n => n.displayOrder);
    const hasDuplicates = displayOrders.length !== new Set(displayOrders).size;
    const hasGaps = nodes.some((n, i) => n.displayOrder !== i);

    if (hasDuplicates || hasGaps) {
      issueCount++;
      console.log(`❌ Parent ${parentId === 'ROOT' ? 'ROOT' : parentId.substring(0, 8)}:`);
      console.log(`   ${nodes.length} items, displayOrders: [${displayOrders.join(', ')}]`);
      if (hasDuplicates) console.log(`   - Has duplicates!`);
      if (hasGaps) console.log(`   - Has gaps or doesn't start at 0!`);
      console.log();
    }
  }

  if (issueCount === 0) {
    console.log('✅ No issues found! All displayOrder values are correct.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${issueCount} parent group(s) with issues.\n`);
  console.log('🔧 Fixing displayOrder values...\n');

  // Fix each parent group
  let fixedCount = 0;
  for (const [parentId, nodes] of Object.entries(byParent)) {
    const displayOrders = nodes.map(n => n.displayOrder);
    const hasDuplicates = displayOrders.length !== new Set(displayOrders).size;
    const hasGaps = nodes.some((n, i) => n.displayOrder !== i);

    if (hasDuplicates || hasGaps) {
      console.log(`Fixing parent ${parentId === 'ROOT' ? 'ROOT' : parentId.substring(0, 8)}...`);

      // Renumber sequentially
      const updates = nodes.map((node, index) =>
        prisma.contentNode.update({
          where: { id: node.id },
          data: { displayOrder: index },
        })
      );

      await prisma.$transaction(updates);
      fixedCount++;
      console.log(`  ✅ Renumbered ${nodes.length} items (0 to ${nodes.length - 1})`);
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} parent group(s)!\n`);

  await prisma.$disconnect();
}

fixDisplayOrder()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
