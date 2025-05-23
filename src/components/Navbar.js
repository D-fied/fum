import React from "react";
import { Navbar as BSNavbar, Nav, Container } from "react-bootstrap";
import Link from "next/link";
import { useRouter } from "next/router";
import WalletConnectEVM from "./WalletConnectEVM";

export default function Navbar() {
  const router = useRouter();

  // Check if the current route is active
  const isActive = (path) => {
    return router.pathname === path || router.pathname.startsWith(`${path}/`);
  };

  return (
    <BSNavbar bg="dark" variant="dark" expand="lg" className="mb-4">
      <Container>
        <Link href="/" passHref legacyBehavior>
          <BSNavbar.Brand style={{ marginRight: "75px", cursor: "pointer" }}>
            <img
              src="/Logo.svg"
              alt="D-fied Logo"
              width="50"
              height="50"
              className="d-inline-block align-top"
            />
            <span style={{ fontSize: "30px"}}>-fied</span>
          </BSNavbar.Brand>
        </Link>

        <BSNavbar.Toggle aria-controls="main-navbar-nav" />

        <BSNavbar.Collapse id="main-navbar-nav">
          <Nav className="me-auto">
            <Link href="/positions" passHref legacyBehavior>
              <Nav.Link active={isActive('/positions')}>Positions</Nav.Link>
            </Link>
            <Link href="/vaults" passHref legacyBehavior>
              <Nav.Link active={isActive('/vaults') || isActive('/vault')}>Vaults</Nav.Link>
            </Link>
          </Nav>

          <Nav>
            <WalletConnectEVM />
          </Nav>
        </BSNavbar.Collapse>
      </Container>
    </BSNavbar>
  );
}
