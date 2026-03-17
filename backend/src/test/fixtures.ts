import { Technology } from "../models/Technology.js";
import { Relation } from "../models/Relation.js";
import { Person } from "../models/Person.js";

export async function seedTestData() {
  const techs = await Technology.insertMany([
    {
      name: "Fire",
      year: -400000,
      yearDisplay: "400000 BCE",
      era: "Prehistoric",
      category: "Energy",
      tags: ["fire", "heat"],
      description: "Controlled use of fire",
      region: "Africa",
      person: null,
    },
    {
      name: "Wheel",
      year: -3500,
      yearDisplay: "3500 BCE",
      era: "Ancient",
      category: "Transportation",
      tags: ["wheel", "movement"],
      description: "Invention of the wheel",
      region: "Mesopotamia",
      person: null,
    },
    {
      name: "Calculus",
      year: 1687,
      yearDisplay: "1687 CE",
      era: "Early Modern",
      category: "Mathematics",
      tags: ["calculus", "analysis"],
      description: "Development of calculus",
      region: "Europe",
      person: "Isaac Newton",
    },
    {
      name: "Classical Mechanics",
      year: 1687,
      yearDisplay: "1687 CE",
      era: "Early Modern",
      category: "Physics",
      tags: ["mechanics", "physics"],
      description: "Laws of motion and gravitation",
      region: "Europe",
      person: "Isaac Newton",
    },
    {
      name: "Analytical Engine",
      year: 1837,
      yearDisplay: "1837 CE",
      era: "Industrial",
      category: "Computers",
      tags: ["computing"],
      description: "Proposed mechanical general-purpose computer",
      region: "Europe",
      person: "Charles Babbage",
    },
  ]);

  const relations = await Relation.insertMany([
    {
      from: techs[2]._id, // Calculus
      to: techs[3]._id, // Classical Mechanics
      type: "enabled",
      fromYear: 1687,
      toYear: 1687,
    },
    {
      from: techs[3]._id, // Classical Mechanics
      to: techs[4]._id, // Analytical Engine
      type: "inspired",
      fromYear: 1687,
      toYear: 1837,
    },
  ]);

  const person = await Person.create({
    name: "Isaac Newton",
    wikipediaUrl: "https://en.wikipedia.org/wiki/Isaac_Newton",
    thumbnailUrl: "https://example.com/newton.jpg",
  });

  return { techs, relations, person };
}
