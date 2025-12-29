#!/bin/bash
# Quick E2E test helper for rapid iteration

set -e

NAMESPACE="${1:-yuptime}"

echo "🧪 Yuptime Quick E2E Test Helper"
echo "=================================="
echo ""
echo "This script helps with common E2E testing tasks."
echo ""

# Menu
PS3='Select an option: '
options=(
    "Run full E2E test suite"
    "Check cluster status"
    "View pod logs"
    "View monitor status"
    "View incidents"
    "View jobs"
    "Port forward API"
    "Cleanup resources"
    "Shell into pod"
    "Quit"
)

select opt in "${options[@]}"
do
    case $REPLY in
        1)
            echo "▶️  Running full E2E test suite..."
            bun run e2e
            break
            ;;
        2)
            echo "📊 Cluster Status:"
            echo ""
            kubectl cluster-info
            echo ""
            echo "Nodes:"
            kubectl get nodes
            echo ""
            echo "Pods in $NAMESPACE:"
            kubectl get pods -n "$NAMESPACE" -o wide
            echo ""
            echo "Services in $NAMESPACE:"
            kubectl get svc -n "$NAMESPACE"
            break
            ;;
        3)
            echo "📋 Pod Logs:"
            echo ""
            pod=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=yuptime -o name | head -1)
            if [ -n "$pod" ]; then
                echo "Following logs for $pod (Ctrl+C to exit)..."
                kubectl logs -n "$NAMESPACE" "$pod" -f
            else
                echo "No pods found"
            fi
            break
            ;;
        4)
            echo "🔍 Monitor Status:"
            echo ""
            kubectl get monitors -n "$NAMESPACE" -o wide
            echo ""
            read -p "Enter monitor name to view details (or press Enter to skip): " monitor_name
            if [ -n "$monitor_name" ]; then
                kubectl get monitor "$monitor_name" -n "$NAMESPACE" -o yaml
            fi
            break
            ;;
        5)
            echo "🚨 Incidents:"
            echo ""
            kubectl get incidents -n "$NAMESPACE" -o wide
            break
            ;;
        6)
            echo "💼 Jobs:"
            echo ""
            kubectl get jobs -n "$NAMESPACE" -o wide
            echo ""
            read -p "Enter job name to view logs (or press Enter to skip): " job_name
            if [ -n "$job_name" ]; then
                pod=$(kubectl get pods -n "$NAMESPACE" -l yuptime.io/job="$job_name" -o name | head -1)
                if [ -n "$pod" ]; then
                    kubectl logs -n "$NAMESPACE" "$pod"
                fi
            fi
            break
            ;;
        7)
            echo "🔌 Port forwarding API to localhost:3000..."
            kubectl port-forward svc/yuptime-api 3000:3000 -n "$NAMESPACE"
            break
            ;;
        8)
            echo "🧹 Cleaning up resources..."
            read -p "Delete namespace $NAMESPACE? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
                echo "✓ Cleanup complete"
            else
                echo "Aborted"
            fi
            break
            ;;
        9)
            echo "🐚 Shelling into pod..."
            echo "Available pods:"
            kubectl get pods -n "$NAMESPACE" -o name
            echo ""
            read -p "Enter pod name: " pod_name
            if [ -n "$pod_name" ]; then
                kubectl exec -it "$pod_name" -n "$NAMESPACE" -- /bin/sh
            fi
            break
            ;;
        10)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "Invalid option"
            break
            ;;
    esac

    # Ask if user wants to continue
    echo ""
    read -p "Press Enter to continue or 'q' to quit: " choice
    if [ "$choice" = "q" ]; then
        exit 0
    fi

    # Re-display menu
    echo ""
    PS3='Select an option: '
done
