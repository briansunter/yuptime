package templates

import (
	rbacv1 "k8s.io/api/rbac/v1"
)

// ClusterRole for the main controller
#ClusterRole: rbacv1.#ClusterRole & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "ClusterRole"
	metadata: {
		name:   #config.metadata.name + "-controller"
		labels: #config.metadata.labels
	}
	rules: [
		// CRD permissions
		{
			apiGroups: ["monitoring.yuptime.io"]
			resources: [
				"monitors",
				"monitorsets",
				"maintenancewindows",
				"silences",
				"yuptimesettings",
			]
			verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
		},
		// Status subresource
		{
			apiGroups: ["monitoring.yuptime.io"]
			resources: [
				"monitors/status",
				"monitorsets/status",
				"maintenancewindows/status",
				"silences/status",
				"yuptimesettings/status",
			]
			verbs: ["get", "update", "patch"]
		},
		// Secrets for password hashes and webhook URLs
		{
			apiGroups: [""]
			resources: ["secrets"]
			verbs: ["get", "list", "watch"]
		},
		// Kubernetes resources for k8s monitor type
		{
			apiGroups: [""]
			resources: ["pods", "services", "endpoints"]
			verbs: ["get", "list", "watch"]
		},
		{
			apiGroups: ["apps"]
			resources: ["deployments", "statefulsets", "daemonsets"]
			verbs: ["get", "list", "watch"]
		},
		// Leases for scheduler leader election
		{
			apiGroups: ["coordination.k8s.io"]
			resources: ["leases"]
			verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
		},
		// Jobs for monitor check execution
		{
			apiGroups: ["batch"]
			resources: ["jobs", "jobs/status"]
			verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
		},
		// Pods for checking Job status
		{
			apiGroups: [""]
			resources: ["pods", "pods/log"]
			verbs: ["get", "list"]
		},
		// Events for recording important occurrences
		{
			apiGroups: [""]
			resources: ["events"]
			verbs: ["create", "patch"]
		},
	]
}

// ClusterRoleBinding for the main controller
#ClusterRoleBinding: rbacv1.#ClusterRoleBinding & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "ClusterRoleBinding"
	metadata: {
		name:   #config.metadata.name + "-controller"
		labels: #config.metadata.labels
	}
	roleRef: {
		apiGroup: "rbac.authorization.k8s.io"
		kind:     "ClusterRole"
		name:     #config.metadata.name + "-controller"
	}
	subjects: [{
		kind:      "ServiceAccount"
		name:      #config.metadata.name
		namespace: #config.metadata.namespace
	}]
}

// Role for the checker executor (namespace-scoped)
#Role: rbacv1.#Role & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "Role"
	metadata: {
		name:      #config.metadata.name + "-checker"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	rules: [
		// Allow reading Monitor CRDs
		{
			apiGroups: ["monitoring.yuptime.io"]
			resources: ["monitors"]
			verbs: ["get", "list"]
		},
		// Allow updating Monitor status (checker writes results here)
		{
			apiGroups: ["monitoring.yuptime.io"]
			resources: ["monitors/status"]
			verbs: ["patch", "update"]
		},
		// Allow creating Events
		{
			apiGroups: [""]
			resources: ["events"]
			verbs: ["create"]
		},
	]
}

// RoleBinding for the checker executor
#RoleBinding: rbacv1.#RoleBinding & {
	#config:    #Config
	apiVersion: "rbac.authorization.k8s.io/v1"
	kind:       "RoleBinding"
	metadata: {
		name:      #config.metadata.name + "-checker"
		namespace: #config.metadata.namespace
		labels:    #config.metadata.labels
	}
	roleRef: {
		apiGroup: "rbac.authorization.k8s.io"
		kind:     "Role"
		name:     #config.metadata.name + "-checker"
	}
	subjects: [{
		kind:      "ServiceAccount"
		name:      #config.metadata.name + "-checker"
		namespace: #config.metadata.namespace
	}]
}
