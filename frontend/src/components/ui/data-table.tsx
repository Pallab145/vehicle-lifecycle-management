'use client';

import * as React from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

// ── Column Definition ──
export interface Column<T> {
    key: string;
    header: string;
    /** Custom cell renderer. Falls back to accessing row[key] */
    render?: (row: T, index: number) => React.ReactNode;
    /** Optional className for the header and cell */
    className?: string;
}

// ── Props ──
export interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    isLoading?: boolean;
    /** Total number of items (for pagination) */
    total?: number;
    page?: number;
    limit?: number;
    onPageChange?: (page: number) => void;
    /** Custom empty state message */
    emptyMessage?: string;
    /** Custom empty state icon */
    emptyIcon?: React.ReactNode;
    /** Optional row click handler */
    onRowClick?: (row: T) => void;
    /** Number of skeleton rows to show when loading */
    skeletonRows?: number;
}

export function DataTable<T extends Record<string, any>>({
    columns,
    data,
    isLoading = false,
    total = 0,
    page = 1,
    limit = 10,
    onPageChange,
    emptyMessage = 'No results found.',
    emptyIcon,
    onRowClick,
    skeletonRows = 5,
}: DataTableProps<T>) {
    const totalPages = Math.ceil(total / limit);
    const showPagination = total > limit && onPageChange;

    return (
        <div className="space-y-4">
            <div className="rounded-md border border-border/50 overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((col) => (
                                <TableHead key={col.key} className={col.className}>
                                    {col.header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: skeletonRows }).map((_, i) => (
                                <TableRow key={`skeleton-${i}`}>
                                    {columns.map((col) => (
                                        <TableCell key={col.key}>
                                            <Skeleton className="h-4 w-full" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length}>
                                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                                        {emptyIcon || <Inbox className="h-10 w-10 mb-3 opacity-40" />}
                                        <p className="text-sm">{emptyMessage}</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((row, rowIndex) => (
                                <TableRow
                                    key={(row as any).id || rowIndex}
                                    className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map((col) => (
                                        <TableCell key={col.key} className={col.className}>
                                            {col.render
                                                ? col.render(row, rowIndex)
                                                : (row[col.key] as React.ReactNode) ?? '—'}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {showPagination && (
                <div className="flex items-center justify-between px-2">
                    <p className="text-sm text-muted-foreground">
                        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange!(page - 1)}
                            disabled={page <= 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {page} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPageChange!(page + 1)}
                            disabled={page >= totalPages}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
