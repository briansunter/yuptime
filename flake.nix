{
  description = "KubeKuma development environment with Timoni and CUE";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Timoni and CUE
            timoni
            cue

            # Kubernetes tools
            kubectl
            kubernetes-helm
            minikube
            k9s

            # Container tools
            docker
            docker-compose

            # Build tools
            bun
            nodejs_20

            # Development utilities
            jq
            yq-go
            just
          ];

          shellHook = ''
            echo "KubeKuma development environment"
            echo ""
            echo "Available tools:"
            echo "  timoni   - Kubernetes package manager ($(timoni version --short 2>/dev/null || echo 'not available'))"
            echo "  cue      - CUE language ($(cue version 2>/dev/null | head -1 || echo 'not available'))"
            echo "  kubectl  - Kubernetes CLI"
            echo "  minikube - Local Kubernetes cluster"
            echo "  bun      - JavaScript runtime"
            echo ""
            echo "Quick start:"
            echo "  minikube start --cpus=4 --memory=8192"
            echo "  eval \$(minikube docker-env)"
            echo "  docker build -t kubekuma-api:latest ."
            echo "  cd timoni/kubekuma && timoni apply kubekuma . -n kubekuma"
          '';
        };

        # Timoni module dev shell
        devShells.timoni = pkgs.mkShell {
          buildInputs = with pkgs; [
            timoni
            cue
            kubectl
            jq
            yq-go
          ];

          shellHook = ''
            echo "Timoni module development environment"
            echo ""
            echo "Commands:"
            echo "  timoni mod vet .     - Validate module"
            echo "  timoni build test .  - Build and preview resources"
            echo "  timoni apply ...     - Apply to cluster"
            echo ""
            cd timoni/kubekuma 2>/dev/null || true
          '';
        };
      });
}
