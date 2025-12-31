package templates

customresourcedefinition: "monitors.monitoring.yuptime.io": {
	// Yuptime Custom Resource Definitions
	// API Group: monitoring.yuptime.io/v1
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "monitors.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "Monitor"
			listKind: "MonitorList"
			plural:   "monitors"
			singular: "monitor"
			shortNames: ["mon"]
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"type",
							"schedule",
							"target",
						]
						properties: {
							enabled: {
								type:    "boolean"
								default: true
							}
							type: {
								type: "string"
								enum: ["http", "tcp", "ping", "dns", "keyword", "jsonQuery", "xmlQuery", "htmlQuery", "websocket", "push", "steam", "k8s", "docker", "mysql", "postgresql", "redis", "grpc"]
							}
							schedule: {
								type: "object"
								required: [
									"intervalSeconds",
									"timeoutSeconds",
								]
								properties: {
									intervalSeconds: {
										type:    "integer"
										minimum: 1
									}
									timeoutSeconds: {
										type:    "integer"
										minimum: 1
									}
									retries: {
										type: "object"
										properties: {
											maxRetries: {
												type:    "integer"
												minimum: 0
											}
											retryIntervalSeconds: {
												type:    "integer"
												minimum: 1
											}
										}
									}
									initialDelaySeconds: {
										type:    "integer"
										minimum: 0
									}
									graceDownSeconds: {
										type:    "integer"
										minimum: 0
									}
									jitterPercent: {
										type:    "integer"
										minimum: 0
										maximum: 100
									}
								}
							}
							target: {
								type: "object"
								properties: {
									http: {
										type: "object"
										required: ["url"]
										properties: {
											url: type: "string"
											method: {
												type: "string"
												enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]
												default: "GET"
											}
											followRedirects: {
												type:    "boolean"
												default: true
											}
											maxRedirects: {
												type:    "integer"
												default: 10
											}
											auth: {
												type: "object"
												properties: {
													basic: {
														type: "object"
														properties: {
															secretRef: {
																type: "object"
																required: ["name"]
																properties: {
																	name: type: "string"
																	usernameKey: type: "string"
																	passwordKey: type: "string"
																}
															}
														}
													}
													bearer: {
														type: "object"
														properties: {
															tokenSecretRef: {
																type: "object"
																required: ["name", "key"]
																properties: {
																	name: type: "string"
																	key: type: "string"
																}
															}
														}
													}
													oauth2: {
														type: "object"
														required: ["tokenUrl", "clientSecretRef"]
														properties: {
															tokenUrl: type: "string"
															clientSecretRef: {
																type: "object"
																required: ["name"]
																properties: {
																	name: type: "string"
																	clientIdKey: type: "string"
																	clientSecretKey: type: "string"
																}
															}
															scopes: {
																type: "array"
																items: type: "string"
															}
														}
													}
												}
											}
											headers: {
												type: "array"
												items: {
													type: "object"
													properties: {
														name: type: "string"
														value: type: "string"
														valueFromSecretRef: {
															type: "object"
															properties: {
																name: type: "string"
																key: type: "string"
															}
														}
													}
												}
											}
											expectedContentType: type: "string"
											maxBodyBytes: {
												type:    "integer"
												default: 1048576
											}
											tls: {
												type: "object"
												properties: {
													verify: {
														type:    "boolean"
														default: true
													}
													sni: type: "string"
													warnBeforeDays: type: "integer"
												}
											}
											dns: {
												type: "object"
												description: "DNS resolution override (HTTP uses external DNS by default)"
												properties: {
													useSystemResolver: type: "boolean"
													resolvers: {
														type: "array"
														items: type: "string"
													}
												}
											}
										}
									}
									tcp: {
										type: "object"
										required: [
											"host",
											"port",
										]
										properties: {
											host: type: "string"
											port: {
												type:    "integer"
												minimum: 1
												maximum: 65535
											}
											send: type: "string"
											expect: type: "string"
											tls: {
												type: "object"
												properties: {
													enabled: type: "boolean"
													verify: type: "boolean"
													sni: type: "string"
												}
											}
											dns: {
												type: "object"
												description: "DNS resolution override (TCP uses system DNS by default)"
												properties: {
													useSystemResolver: type: "boolean"
													resolvers: {
														type: "array"
														items: type: "string"
													}
												}
											}
										}
									}
									dns: {
										type: "object"
										required: [
											"name",
											"recordType",
										]
										properties: {
											name: type: "string"
											recordType: {
												type: "string"
												enum: ["A", "AAAA", "CNAME", "TXT", "MX", "SRV"]
											}
											expected: {
												type: "object"
												properties: values: {
													type: "array"
													items: type: "string"
												}
											}
										}
									}
									ping: {
										type: "object"
										required: ["host"]
										properties: {
											host: type: "string"
											packetCount: {
												type:    "integer"
												minimum: 1
												default: 1
											}
										}
									}
									websocket: {
										type: "object"
										required: ["url"]
										properties: {
											url: type: "string"
											send: type: "string"
											expect: type: "string"
										}
									}
								mysql: {
									type: "object"
									required: [
										"host",
										"port",
									]
									properties: {
										host: type: "string"
										port: {
											type:    "integer"
											minimum: 1
											maximum: 65535
										}
										database: type: "string"
										credentialsSecretRef: {
											type: "object"
											properties: {
												name: type: "string"
												usernameKey: type: "string"
												passwordKey: type: "string"
											}
										}
										healthQuery: type: "string"
									}
								}
								postgresql: {
									type: "object"
									required: [
										"host",
										"port",
									]
									properties: {
										host: type: "string"
										port: {
											type:    "integer"
											minimum: 1
											maximum: 65535
										}
										database: type: "string"
										credentialsSecretRef: {
											type: "object"
											properties: {
												name: type: "string"
												usernameKey: type: "string"
												passwordKey: type: "string"
											}
										}
										healthQuery: type: "string"
										sslMode: {
											type: "string"
											enum: ["disable", "prefer", "require", "verify-ca", "verify-full"]
										}
									}
								}
								redis: {
									type: "object"
									required: [
										"host",
										"port",
									]
									properties: {
										host: type: "string"
										port: {
											type:    "integer"
											minimum: 1
											maximum: 65535
										}
										database: {
											type:    "integer"
											minimum: 0
										}
										credentialsSecretRef: {
											type: "object"
											properties: {
												name: type: "string"
												passwordKey: type: "string"
											}
										}
									}
								}
								grpc: {
									type: "object"
									required: [
										"host",
										"port",
									]
									properties: {
										host: type: "string"
										port: {
											type:    "integer"
											minimum: 1
											maximum: 65535
										}
										service: type: "string"
										tls: {
											type: "object"
											properties: {
												enabled: type: "boolean"
												verify: type: "boolean"
											}
										}
										dns: {
											type: "object"
											description: "DNS resolution override (gRPC uses system DNS by default)"
											properties: {
												useSystemResolver: type: "boolean"
												resolvers: {
													type: "array"
													items: type: "string"
												}
											}
										}
									}
								}
								}
							}
							successCriteria: {
								type: "object"
								properties: {
									http: {
										type: "object"
										properties: {
											acceptedStatusCodes: {
												type: "array"
												items: type: "integer"
											}
											latencyMsUnder: type: "integer"
										}
									}
									keyword: {
										type: "object"
										properties: {
											contains: {
												type: "array"
												items: type: "string"
											}
											notContains: {
												type: "array"
												items: type: "string"
											}
										}
									}
									jsonQuery: {
										type: "object"
										required: ["path"]
										properties: {
											mode: {
												type:    "string"
												enum: ["jsonpath", "jsonpath-plus"]
												default: "jsonpath-plus"
											}
											path: type: "string"
											equals: "x-kubernetes-preserve-unknown-fields": true
											contains: type: "string"
											exists: type:      "boolean"
											count: type:       "integer"
											greaterThan: type: "number"
											lessThan: type:    "number"
										}
									}
									xmlQuery: {
										type: "object"
										required: ["path"]
										properties: {
											mode: {
												type:    "string"
												enum: ["xpath"]
												default: "xpath"
											}
											path: type:            "string"
											equals: type:          "string"
											contains: type:        "string"
											exists: type:          "boolean"
											count: type:           "integer"
											ignoreNamespace: {
												type:    "boolean"
												default: false
											}
										}
									}
									htmlQuery: {
										type: "object"
										required: ["selector"]
										properties: {
											mode: {
												type:    "string"
												enum: ["css"]
												default: "css"
											}
											selector: type: "string"
											exists: type:   "boolean"
											count: type:    "integer"
											text: {
												type: "object"
												properties: {
													equals: type:   "string"
													contains: type: "string"
													matches: type:  "string"
												}
											}
											attribute: {
												type: "object"
												required: ["name"]
												properties: {
													name: type:     "string"
													equals: type:   "string"
													contains: type: "string"
													exists: type:   "boolean"
												}
											}
										}
									}
								}
							}
							alerting: {
								type: "object"
								properties: {
									policyRef: {
										type: "object"
										properties: name: type: "string"
									}
									resendIntervalMinutes: {
										type:    "integer"
										default: 0
									}
									notifyOn: {
										type: "object"
										properties: {
											down: {
												type:    "boolean"
												default: true
											}
											up: {
												type:    "boolean"
												default: true
											}
											flapping: {
												type:    "boolean"
												default: true
											}
											certExpiring: {
												type:    "boolean"
												default: true
											}
										}
									}
								}
							}
							tags: {
								type: "array"
								items: type: "string"
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
							lastResult: {
								type: "object"
								properties: {
									state: {
										type: "string"
										enum: ["up", "down", "pending", "flapping", "paused"]
									}
									checkedAt: type: "string"
									latencyMs: type: "number"
									attempts: type: "integer"
									reason: type: "string"
									message: type: "string"
								}
							}
							uptime: {
								type: "object"
								properties: {
									last1h: type: "number"
									last24h: type: "number"
									last7d: type: "number"
									last30d: type: "number"
								}
							}
							nextRunAt: type: "string"
						}
					}
				}
			}
			subresources: status: {}
			additionalPrinterColumns: [{
				name:     "Type"
				type:     "string"
				jsonPath: ".spec.type"
			}, {
				name:     "Status"
				type:     "string"
				jsonPath: ".status.lastResult.state"
			}, {
				name:     "Last Check"
				type:     "string"
				jsonPath: ".status.lastResult.checkedAt"
			}, {
				name:     "Age"
				type:     "date"
				jsonPath: ".metadata.creationTimestamp"
			}]
		}]
	}
}
customresourcedefinition: "localusers.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "localusers.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "LocalUser"
			listKind: "LocalUserList"
			plural:   "localusers"
			singular: "localuser"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"username",
							"role",
							"passwordHashSecretRef",
						]
						properties: {
							username: {
								type:      "string"
								minLength: 1
							}
							passwordHashSecretRef: {
								type: "object"
								required: [
									"name",
									"key",
								]
								properties: {
									name: type: "string"
									key: type: "string"
								}
							}
							role: {
								type: "string"
								enum: ["admin", "editor", "viewer"]
							}
							mfa: {
								type: "object"
								properties: {
									mode: {
										type: "string"
										enum: ["disabled", "optional", "required"]
									}
									totpSecretRef: {
										type: "object"
										properties: {
											name: type: "string"
											key: type: "string"
										}
									}
								}
							}
							disabled: {
								type:    "boolean"
								default: false
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
							lastLoginAt: type: "string"
							mfaEnabled: type: "boolean"
						}
					}
				}
			}
			subresources: status: {}
			additionalPrinterColumns: [{
				name:     "Username"
				type:     "string"
				jsonPath: ".spec.username"
			}, {
				name:     "Role"
				type:     "string"
				jsonPath: ".spec.role"
			}, {
				name:     "Disabled"
				type:     "boolean"
				jsonPath: ".spec.disabled"
			}, {
				name:     "Age"
				type:     "date"
				jsonPath: ".metadata.creationTimestamp"
			}]
		}]
	}
}
customresourcedefinition: "statuspages.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "statuspages.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "StatusPage"
			listKind: "StatusPageList"
			plural:   "statuspages"
			singular: "statuspage"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"slug",
							"title",
						]
						properties: {
							slug: type: "string"
							title: type: "string"
							published: {
								type:    "boolean"
								default: false
							}
							content: {
								type: "object"
								properties: {
									description: type: "string"
									branding: {
										type: "object"
										properties: {
											logo: type: "string"
											favicon: type: "string"
											primaryColor: type: "string"
										}
									}
								}
							}
							groups: {
								type: "array"
								items: {
									type: "object"
									required: ["name"]
									properties: {
										name: type: "string"
										description: type: "string"
										monitors: {
											type: "array"
											items: {
												type: "object"
												required: ["ref"]
												properties: ref: {
													type: "object"
													required: [
														"namespace",
														"name",
													]
													properties: {
														namespace: type: "string"
														name: type: "string"
													}
												}
											}
										}
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
			additionalPrinterColumns: [{
				name:     "Slug"
				type:     "string"
				jsonPath: ".spec.slug"
			}, {
				name:     "Published"
				type:     "boolean"
				jsonPath: ".spec.published"
			}, {
				name:     "Age"
				type:     "date"
				jsonPath: ".metadata.creationTimestamp"
			}]
		}]
	}
}
customresourcedefinition: "notificationproviders.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "notificationproviders.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "NotificationProvider"
			listKind: "NotificationProviderList"
			plural:   "notificationproviders"
			singular: "notificationprovider"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: ["type"]
						properties: {
							type: {
								type: "string"
								enum: ["slack", "discord", "smtp", "webhook", "pagerduty", "opsgenie"]
							}
							slack: {
								type: "object"
								properties: webhookUrlSecretRef: {
									type: "object"
									properties: {
										name: type: "string"
										key: type: "string"
									}
								}
							}
							discord: {
								type: "object"
								properties: webhookUrlSecretRef: {
									type: "object"
									properties: {
										name: type: "string"
										key: type: "string"
									}
								}
							}
							webhook: {
								type: "object"
								properties: {
									url: type: "string"
									method: type: "string"
									headers: {
										type: "array"
										items: {
											type: "object"
											properties: {
												name: type: "string"
												value: type: "string"
											}
										}
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "notificationpolicies.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "notificationpolicies.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "NotificationPolicy"
			listKind: "NotificationPolicyList"
			plural:   "notificationpolicies"
			singular: "notificationpolicy"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						properties: {
							selector: {
								type: "object"
								properties: {
									matchNamespaces: {
										type: "array"
										items: type: "string"
									}
									matchLabels: {
										type: "object"
										additionalProperties: type: "string"
									}
									matchTags: {
										type: "array"
										items: type: "string"
									}
								}
							}
							providers: {
								type: "array"
								items: {
									type: "object"
									properties: ref: {
										type: "object"
										properties: {
											namespace: type: "string"
											name: type: "string"
										}
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "maintenancewindows.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "maintenancewindows.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "MaintenanceWindow"
			listKind: "MaintenanceWindowList"
			plural:   "maintenancewindows"
			singular: "maintenancewindow"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"schedule",
							"durationMinutes",
						]
						properties: {
							schedule: {
								type:        "string"
								description: "RRULE format schedule"
							}
							durationMinutes: {
								type:    "integer"
								minimum: 1
							}
							description: type: "string"
							selector: {
								type: "object"
								properties: {
									matchNamespaces: {
										type: "array"
										items: type: "string"
									}
									matchLabels: {
										type: "object"
										additionalProperties: type: "string"
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							nextOccurrenceAt: type: "string"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "silences.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "silences.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "Silence"
			listKind: "SilenceList"
			plural:   "silences"
			singular: "silence"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"startsAt",
							"endsAt",
						]
						properties: {
							startsAt: {
								type:   "string"
								format: "date-time"
							}
							endsAt: {
								type:   "string"
								format: "date-time"
							}
							reason: type: "string"
							selector: {
								type: "object"
								properties: {
									matchNamespaces: {
										type: "array"
										items: type: "string"
									}
									matchLabels: {
										type: "object"
										additionalProperties: type: "string"
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							active: type: "boolean"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "monitorsets.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "monitorsets.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "MonitorSet"
			listKind: "MonitorSetList"
			plural:   "monitorsets"
			singular: "monitorset"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						properties: {
							template: {
								type:                                   "object"
								"x-kubernetes-preserve-unknown-fields": true
							}
							targets: {
								type: "array"
								items: {
									type:                                   "object"
									"x-kubernetes-preserve-unknown-fields": true
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "apikeys.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "apikeys.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "ApiKey"
			listKind: "ApiKeyList"
			plural:   "apikeys"
			singular: "apikey"
		}
		scope: "Namespaced"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				required: ["spec"]
				properties: {
					spec: {
						type: "object"
						required: [
							"name",
							"role",
						]
						properties: {
							name: type: "string"
							role: {
								type: "string"
								enum: ["admin", "editor", "viewer"]
							}
							keyHashSecretRef: {
								type: "object"
								properties: {
									name: type: "string"
									key: type: "string"
								}
							}
							expiresAt: type: "string"
							disabled: {
								type:    "boolean"
								default: false
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							lastUsedAt: type: "string"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
customresourcedefinition: "yuptimesettings.monitoring.yuptime.io": {
	apiVersion: "apiextensions.k8s.io/v1"
	kind:       "CustomResourceDefinition"
	metadata: name: "yuptimesettings.monitoring.yuptime.io"
	spec: {
		group: "monitoring.yuptime.io"
		names: {
			kind:     "YuptimeSettings"
			listKind: "YuptimeSettingsList"
			plural:   "yuptimesettings"
			singular: "yuptimesettings"
		}
		scope: "Cluster"
		versions: [{
			name:    "v1"
			served:  true
			storage: true
			schema: openAPIV3Schema: {
				type: "object"
				properties: {
					spec: {
						type: "object"
						properties: {
							mode: {
								type: "object"
								properties: {
									gitOpsReadOnly: {
										type: "boolean"
										default: false
									}
									singleInstanceRequired: {
										type: "boolean"
										default: true
									}
								}
							}
							scheduler: {
								type: "object"
								properties: {
									minIntervalSeconds: {
										type: "integer"
										minimum: 1
										default: 20
									}
									maxConcurrentNetChecks: {
										type: "integer"
										minimum: 1
										default: 200
									}
									maxConcurrentPrivChecks: {
										type: "integer"
										minimum: 1
										default: 20
									}
									defaultTimeoutSeconds: {
										type: "integer"
										minimum: 1
										default: 10
									}
									jitterPercent: {
										type: "integer"
										minimum: 0
										maximum: 100
										default: 5
									}
									flapping: {
										type: "object"
										properties: {
											enabled: {
												type: "boolean"
												default: true
											}
											toggleThreshold: {
												type: "integer"
												minimum: 1
												default: 6
											}
											windowMinutes: {
												type: "integer"
												minimum: 1
												default: 10
											}
											suppressNotificationsMinutes: {
												type: "integer"
												minimum: 0
												default: 30
											}
										}
									}
								}
							}
							networking: {
								type: "object"
								properties: {
									userAgent: {
										type: "string"
										default: "Yuptime/1.0"
									}
									dns: {
										type: "object"
										description: "DNS resolution settings (defaults to external DNS for true external testing)"
										properties: {
											resolvers: {
												type: "array"
												items: type: "string"
												default: ["8.8.8.8", "1.1.1.1"]
											}
											timeoutSeconds: {
												type: "integer"
												minimum: 1
												default: 5
											}
										}
									}
									ping: {
										type: "object"
										properties: {
											mode: {
												type: "string"
												enum: ["icmp", "tcpFallback", "tcpOnly"]
												default: "tcpFallback"
											}
											tcpFallbackPort: {
												type: "integer"
												minimum: 1
												maximum: 65535
												default: 443
											}
										}
									}
								}
							}
						}
					}
					status: {
						type: "object"
						properties: {
							observedGeneration: type: "integer"
							conditions: {
								type: "array"
								items: {
									type: "object"
									properties: {
										type: type: "string"
										status: type: "string"
										reason: type: "string"
										message: type: "string"
										lastTransitionTime: type: "string"
									}
								}
							}
						}
					}
				}
			}
			subresources: status: {}
		}]
	}
}
