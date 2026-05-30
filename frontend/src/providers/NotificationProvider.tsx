'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Hit the Next.js proxy directly so we don't have to worry about CORS or absolute URLs
        const streamUrl = `/api/notifications/stream`;

        // Initialize SSE Connection
        const sse = new EventSource(streamUrl, {
            withCredentials: true, // Crucial for sending the HttpOnly JWT cookie
        });

        eventSourceRef.current = sse;

        sse.onopen = () => {
            console.log('SSE: Connected to backend notification stream');
        };

        // Standard event listener for the custom 'TRANSACTION_UPDATE' event
        sse.addEventListener('TRANSACTION_UPDATE', (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                handleNotification(data);
            } catch (error) {
                console.error('SSE: Error parsing event data', error);
            }
        });

        // Built-in message listener (if backend sends standard 'message' events)
        sse.onmessage = (event: MessageEvent) => {
            // The backend sends ':\n\n' heartbeats without a specific event type.
            // We can safely ignore them.
        };

        sse.onerror = (error) => {
            console.error('SSE: Connection error', error);
            // EventSource auto-reconnects, but if it's unauthorized (401), we might want to handle it
            if (sse.readyState === EventSource.CLOSED) {
                console.log('SSE: Connection closed permanently');
            }
        };

        return () => {
            console.log('SSE: Disconnecting from notification stream');
            sse.close();
            eventSourceRef.current = null;
        };
    }, []);

    // Global Event Handler mapping Blockchain Events to UI updates
    const handleNotification = (payload: any) => {
        console.log('SSE: Received Payload', payload);

        switch (payload.type) {
            case 'TX_STATUS_CHANGE':
                if (payload.data.status === 'MINED') {
                    toast.success(`Transaction Mined: ${payload.data.actionType}`, {
                        description: `TxHash: ${payload.data.txHash.substring(0, 10)}...`
                    });
                } else if (payload.data.status === 'FAILED') {
                    toast.error(`Transaction Failed: ${payload.data.actionType}`, {
                        description: 'The smart contract reverted the transaction.'
                    });
                }
                // Invalidate global queries to ensure UI is fresh
                queryClient.invalidateQueries(); 
                break;

            case 'VEHICLE_REG':
                toast.success('Vehicle Registered Successfully');
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicles'] });
                break;

            case 'XFER_INIT':
                toast.info('Transfer Request Initiated');
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicles'] });
                break;

            case 'XFER_APPROVED':
            case 'XFER_DONE':
                toast.success('Vehicle Transfer Completed!');
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicles'] });
                break;

            case 'CHALLAN_ISSUED':
                toast.warning('New Traffic Challan Issued', {
                    description: `Amount: ₹${payload.data.amount}`
                });
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicle'] });
                break;

            case 'POLICY_ISSUED':
                toast.success('Insurance Policy Activated');
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicle'] });
                break;

            case 'PUC_ISSUED':
                toast.success('PUC Certificate Uploaded');
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicle'] });
                break;

            case 'LOAN_REG':
                toast.info('Bank Loan Registered', {
                    description: `Amount: ₹${payload.data.amount}`
                });
                queryClient.invalidateQueries({ queryKey: ['citizen', 'vehicle'] });
                break;

            default:
                // Handle generic entity toggles and other system events
                if (payload.type?.includes('_TOGGLED')) {
                    toast.info('System Update', { description: 'An institution status was changed.' });
                    queryClient.invalidateQueries();
                } else {
                    console.log('SSE: Unhandled event type', payload.type);
                }
                break;
        }
    };

    return <>{children}</>;
}
