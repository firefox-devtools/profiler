#!/usr/bin/env perl

# Convert Flow object type spreads to TypeScript intersection types
# Usage: perl convert-flow-spreads.pl <file>

use strict;
use warnings;

my $filename = $ARGV[0] or die "Usage: $0 <filename>\n";

# Read the entire file
open my $fh, '<', $filename or die "Cannot open $filename: $!\n";
my $content = do { local $/; <$fh> };
close $fh;

my $changed = 1;
my $iterations = 0;

print "Converting Flow object type spreads to TypeScript intersection types...\n";

# Step 1: Convert spreads at the beginning: { ...TypeA, -> TypeA & {
# Run until no more changes
while ($changed && $iterations < 100) {  # Safety limit
    $changed = 0;
    $iterations++;
    
    if ($content =~ s/\{\s*\.\.\.([A-Z][A-Za-z0-9_]*)\s*,/\1 & {/g) {
        $changed = 1;
        print "Applied spread-at-start conversion (iteration $iterations)\n";
    }
}

$changed = 1;
$iterations = 0;

# Step 2: Convert spreads in the middle: , ...TypeB, -> } & TypeB & {
while ($changed && $iterations < 100) {  # Safety limit
    $changed = 0;
    $iterations++;
    
    if ($content =~ s/,\s*\.\.\.([A-Z][A-Za-z0-9_]*)\s*,/} & \1 & {/g) {
        $changed = 1;
        print "Applied spread-in-middle conversion (iteration $iterations)\n";
    }
}

$changed = 1;
$iterations = 0;

# Step 3: Convert spreads at the end: , ...TypeB } -> } & TypeB
while ($changed && $iterations < 100) {  # Safety limit
    $changed = 0;
    $iterations++;
    
    if ($content =~ s/,\s*\.\.\.([A-Z][A-Za-z0-9_]*)\s*\}/} & \1/g) {
        $changed = 1;
        print "Applied spread-at-end conversion (iteration $iterations)\n";
    }
}

# Step 4: Convert remaining single spreads: { ...TypeA } -> TypeA
if ($content =~ s/\{\s*\.\.\.([A-Z][A-Za-z0-9_]*)\s*\}/\1/g) {
    print "Applied single spread conversion\n";
}

# Write the file back
open $fh, '>', $filename or die "Cannot write to $filename: $!\n";
print $fh $content;
close $fh;

print "Flow object type spread conversion complete!\n";