import React from "react";
import { Card } from "react-bootstrap";

export default function PositionCard({ position }) {
  return (
    <Card className="mb-3" style={{ backgroundColor: "#f5f5f5", borderColor: "#a30000" }}>
      <Card.Body>
        <Card.Title>Position #{position.id} - {position.tokenPair}</Card.Title>
        <Card.Text>
          <strong>Activity:</strong> {position.active}<br />
          {/* Placeholder for future fields - can re-add later */}
          {/* <strong>Liquidity:</strong> {position.liquidity}<br />
          <strong>Unclaimed Fees:</strong> {position.unclaimedFees}<br />
          <strong>Price Range:</strong> {position.priceRange}<br />
          <strong>Current Price:</strong> {position.currentPrice}<br />
          <strong>Holdings:</strong> {position.holdings} */}
        </Card.Text>
      </Card.Body>
    </Card>
  );
}
